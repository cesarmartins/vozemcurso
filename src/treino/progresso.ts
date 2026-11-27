// Progresso do treino no Supabase (tabelas "treinos" e "treinos_concluidos").
// A tela lê de um cache em memória, preenchido por carregarProgresso(); marcar um passo
// atualiza o cache na hora e grava no banco em seguida (sem travar a tela).

import { supabase } from '../supabase';
import { dataLocal, diaMenos, type Estado, type Progresso } from './rotina';

/** Quantos dias de detalhe buscar (a sequência usa todos os dias concluídos). */
const DIAS_DETALHE = 60;

const cache = new Map<string, Progresso>();

const vazio = (): Progresso => ({ dias: {}, concluidos: [] });

/** Gravação em segundo plano: se falhar, avisa no console e a próxima carga corrige. */
function gravarDepois(acao: PromiseLike<{ error: unknown }>) {
  void Promise.resolve(acao).then(({ error }) => {
    if (error) console.warn('Não consegui salvar o progresso do treino.', error);
  });
}

export async function carregarProgresso(contaId: string): Promise<Progresso> {
  if (!contaId) return vazio();
  const desde = diaMenos(dataLocal(new Date()), DIAS_DETALHE);
  const [passos, concluidos] = await Promise.all([
    supabase.from('treinos').select('dia, passo, estado').eq('aluno_id', contaId).gte('dia', desde),
    supabase.from('treinos_concluidos').select('dia').eq('aluno_id', contaId),
  ]);
  if (passos.error || concluidos.error) return cache.get(contaId) ?? vazio();
  const p = vazio();
  for (const l of passos.data as { dia: string; passo: string; estado: Estado }[]) (p.dias[l.dia] ??= {})[l.passo] = l.estado;
  p.concluidos = (concluidos.data as { dia: string }[]).map((l) => l.dia);
  cache.set(contaId, p);
  return p;
}

export function lerProgresso(contaId: string): Progresso {
  return cache.get(contaId) ?? vazio();
}

function doCache(contaId: string): Progresso {
  const p = cache.get(contaId) ?? vazio();
  cache.set(contaId, p);
  return p;
}

export function marcar(contaId: string, data: string, passoId: string, estado: Estado | null): Progresso {
  const p = doCache(contaId);
  const dia = (p.dias[data] ??= {});
  if (estado) {
    dia[passoId] = estado;
    gravarDepois(supabase.from('treinos').upsert({ aluno_id: contaId, dia: data, passo: passoId, estado }));
  } else {
    delete dia[passoId];
    gravarDepois(supabase.from('treinos').delete().eq('aluno_id', contaId).eq('dia', data).eq('passo', passoId));
  }
  return p;
}

/** Marca o treino do dia como concluído (quando todos os passos foram feitos ou pulados). */
export function concluirDia(contaId: string, data: string): Progresso {
  const p = doCache(contaId);
  if (!p.concluidos.includes(data)) {
    p.concluidos.push(data);
    gravarDepois(supabase.from('treinos_concluidos').upsert({ aluno_id: contaId, dia: data }));
  }
  return p;
}

/** Zera os passos marcados hoje para treinar de novo. O dia continua contando como concluído. */
export function reiniciarDia(contaId: string, data: string): Progresso {
  const p = doCache(contaId);
  delete p.dias[data];
  gravarDepois(supabase.from('treinos').delete().eq('aluno_id', contaId).eq('dia', data));
  return p;
}
