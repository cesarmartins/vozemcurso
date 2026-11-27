// Biblioteca de exercícios (áudios de piano) no Supabase.
// A tabela "exercicios" guarda os dados; o áudio fica na pasta privada "exercicios" do Storage,
// em <dono>/<id>.<extensão>. O banco só deixa o dono e os alunos da turma dele abrirem.

import { BUCKET_AUDIOS, supabase } from '../supabase';
import { EXERCICIOS_INCLUIDOS, type CategoriaId } from './catalogo';

export interface ExercicioPessoal {
  id: string;
  /** Conta que cadastrou: o professor (para a turma) ou o aluno independente. */
  donoId: string;
  nome: string;
  categoria: CategoriaId;
  equipamento: string;
  arquivoNome: string;
  criadoEm: number;
  /** O professor (ou o aluno independente) mandou este exercício para a rotina de treino. */
  naRotina: boolean;
  /** Caminho do áudio no Storage. */
  audioPath: string;
  /** Endereço temporário (1 hora) para tocar o áudio. */
  audioUrl: string;
  obterAudio: () => Promise<Blob>;
}

interface Linha {
  id: string;
  dono_id: string;
  nome: string;
  categoria: CategoriaId;
  equipamento: string;
  audio_path: string;
  arquivo_nome: string;
  na_rotina: boolean;
  criado_em: string;
}

const UMA_HORA = 3600;
const MAX_BYTES = 20 * 1024 * 1024;

async function baixar(caminho: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET_AUDIOS).download(caminho);
  if (error || !data) throw new Error('Não consegui baixar o áudio deste exercício.');
  return data;
}

/** Exercícios cadastrados por uma conta, do mais novo para o mais antigo. */
export async function listarExercicios(donoId: string): Promise<ExercicioPessoal[]> {
  const { data, error } = await supabase.from('exercicios').select('*').eq('dono_id', donoId).order('criado_em', { ascending: false });
  if (error) throw new Error('Não foi possível abrir a biblioteca. Verifique a internet.');
  const linhas = (data ?? []) as Linha[];
  const urls = new Map<string, string>();
  if (linhas.length) {
    const { data: assinadas } = await supabase.storage.from(BUCKET_AUDIOS).createSignedUrls(linhas.map((l) => l.audio_path), UMA_HORA);
    for (const a of assinadas ?? []) if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl);
  }
  return linhas.map((l) => ({
    id: l.id,
    donoId: l.dono_id,
    nome: l.nome,
    categoria: l.categoria,
    equipamento: l.equipamento,
    arquivoNome: l.arquivo_nome,
    criadoEm: Date.parse(l.criado_em),
    naRotina: l.na_rotina,
    audioPath: l.audio_path,
    audioUrl: urls.get(l.audio_path) ?? '',
    obterAudio: () => baixar(l.audio_path),
  }));
}

/** Envia o áudio e cadastra o exercício. */
export async function adicionarExercicio(dados: { donoId: string; nome: string; categoria: CategoriaId; equipamento: string; arquivo: File }): Promise<void> {
  if (dados.arquivo.size > MAX_BYTES) throw new Error('O áudio passa de 20 MB. Use um arquivo menor (MP3 ou M4A).');
  const id = crypto.randomUUID();
  const extensao = (/\.([a-z0-9]{2,5})$/i.exec(dados.arquivo.name)?.[1] ?? 'mp3').toLowerCase();
  const caminho = `${dados.donoId}/${id}.${extensao}`;
  const envio = await supabase.storage.from(BUCKET_AUDIOS).upload(caminho, dados.arquivo, { contentType: dados.arquivo.type || 'audio/mpeg', upsert: false });
  if (envio.error) throw new Error('Não consegui enviar o áudio. Verifique a internet e tente de novo.');
  const { error } = await supabase.from('exercicios').insert({
    id,
    dono_id: dados.donoId,
    nome: dados.nome,
    categoria: dados.categoria,
    equipamento: dados.equipamento,
    audio_path: caminho,
    arquivo_nome: dados.arquivo.name,
  });
  if (error) {
    await supabase.storage.from(BUCKET_AUDIOS).remove([caminho]);
    throw new Error('Não consegui salvar o exercício.');
  }
}

export async function definirNaRotina(id: string, naRotina: boolean): Promise<void> {
  const { error } = await supabase.from('exercicios').update({ na_rotina: naRotina }).eq('id', id);
  if (error) throw new Error('Não foi possível alterar a rotina.');
}

/** Apaga o exercício, o áudio e (pelo banco) o histórico de práticas dele. */
export async function excluirExercicio(ex: Pick<ExercicioPessoal, 'id' | 'audioPath'>): Promise<void> {
  const { error } = await supabase.from('exercicios').delete().eq('id', ex.id);
  if (error) throw new Error('Não foi possível remover o exercício.');
  await supabase.storage.from(BUCKET_AUDIOS).remove([ex.audioPath]);
}

/** Total de exercícios: os da conta mais os distribuídos com o app. */
export async function contarExercicios(donoId: string): Promise<number> {
  const { count, error } = await supabase.from('exercicios').select('id', { count: 'exact', head: true }).eq('dono_id', donoId);
  if (error) throw new Error('Não consegui contar os exercícios.');
  return (count ?? 0) + EXERCICIOS_INCLUIDOS.length;
}
