// Servidor de verdade: contas, turmas, convites e agenda no Supabase.
// Mesma interface da versão local (local.ts), que continua sendo usada nos testes.

import type { PostgrestError } from '@supabase/supabase-js';
import { conflito, descrever, ordenar, validarHorario } from '../agenda/horarios';
import { supabase } from '../supabase';
import { normalizarCodigo, normalizarEmail, SENHA_MIN } from './local';
import { ErroConta, type Aula, type Conta, type Convite, type FichaAluno, type NovaConta, type Servidor, type Turma } from './tipos';

/** A conta foi criada, mas precisa confirmar o e-mail antes de entrar. */
export class ConfirmeEmail extends ErroConta {}

interface LinhaConta {
  id: string;
  tipo: 'professor' | 'aluno';
  nome: string;
  email: string;
  professor_id: string | null;
  codigo_turma: string | null;
  voz: string;
  objetivo: string;
  criado_em: string;
}
interface LinhaConvite {
  id: string;
  professor_id: string;
  nome: string;
  email: string;
  criado_em: string;
}
interface LinhaAula {
  id: string;
  professor_id: string;
  aluno_email: string;
  dia: number;
  inicio: string;
  duracao: number;
  modalidade: 'presencial' | 'online';
  local: string;
  criado_em: string;
}
interface LinhaFicha {
  professor_id: string;
  aluno_email: string;
  telefone: string;
  observacoes: string;
}

const conta = (l: LinhaConta): Conta => ({
  id: l.id,
  tipo: l.tipo,
  nome: l.nome,
  email: l.email,
  professorId: l.professor_id,
  codigoTurma: l.codigo_turma,
  voz: l.voz,
  objetivo: l.objetivo,
  criadoEm: Date.parse(l.criado_em),
});
const convite = (l: LinhaConvite): Convite => ({ id: l.id, professorId: l.professor_id, nome: l.nome, email: l.email, criadoEm: Date.parse(l.criado_em) });
const aula = (l: LinhaAula): Aula => ({
  id: l.id,
  professorId: l.professor_id,
  alunoEmail: l.aluno_email,
  dia: l.dia,
  inicio: l.inicio.slice(0, 5), // o banco devolve "14:00:00"
  duracao: l.duracao,
  modalidade: l.modalidade,
  local: l.local,
  criadoEm: Date.parse(l.criado_em),
});
const ficha = (l: LinhaFicha): FichaAluno => ({ professorId: l.professor_id, alunoEmail: l.aluno_email, telefone: l.telefone, observacoes: l.observacoes });

/** Traduz os erros do Supabase para mensagens que dá para mostrar na tela. */
function falha(erro: { message: string; code?: string } | PostgrestError | null | undefined, padrao = 'Algo deu errado. Tente de novo.'): never {
  const msg = erro?.message ?? '';
  if (/Invalid login credentials/i.test(msg)) throw new ErroConta('E-mail ou senha incorretos.');
  if (/Email not confirmed/i.test(msg)) throw new ErroConta('Confirme seu e-mail antes de entrar: procure a mensagem do Voz em Curso na sua caixa de entrada.');
  if (/already registered|already been registered|User already exists/i.test(msg)) throw new ErroConta('Já existe uma conta com esse e-mail. Use “Entrar”.');
  if (/rate limit|too many/i.test(msg)) throw new ErroConta('Muitas tentativas seguidas. Espere alguns minutos e tente de novo.');
  if (/Password should|weak password/i.test(msg)) throw new ErroConta(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres, com letras e números.`);
  if (/invalid.*email|Unable to validate email/i.test(msg)) throw new ErroConta('Informe um e-mail válido.');
  if (/Failed to fetch|NetworkError|network/i.test(msg)) throw new ErroConta('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  // Mensagens que o próprio banco escreve (raise exception) já vêm em português.
  if (erro && 'code' in erro && erro.code === 'P0001' && msg) throw new ErroConta(msg);
  throw new ErroConta(padrao);
}

async function minhaConta(): Promise<Conta | null> {
  const { data: sessao } = await supabase.auth.getSession();
  const id = sessao.session?.user.id;
  if (!id) return null;
  const { data, error } = await supabase.from('contas').select('*').eq('id', id).maybeSingle<LinhaConta>();
  if (error) falha(error, 'Não consegui carregar sua conta.');
  return data ? conta(data) : null;
}

async function contaObrigatoria(): Promise<Conta> {
  const c = await minhaConta();
  if (!c) throw new ErroConta('Sua sessão expirou. Entre de novo.');
  return c;
}

const emailValido = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function criarServidorSupabase(): Servidor {
  const servidor: Servidor = {
    contaAtual: minhaConta,

    async cadastrar({ tipo, nome, email, senha, codigoTurma }: NovaConta) {
      const nomeLimpo = nome.trim();
      const emailLimpo = normalizarEmail(email);
      if (!nomeLimpo) throw new ErroConta('Informe seu nome.');
      if (!emailValido(emailLimpo)) throw new ErroConta('Informe um e-mail válido.');
      if (senha.length < SENHA_MIN) throw new ErroConta(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
      const codigo = tipo === 'aluno' && codigoTurma?.trim() ? normalizarCodigo(codigoTurma) : '';
      if (codigo) {
        const { data, error } = await supabase.rpc('turma_por_codigo', { codigo });
        if (error) falha(error);
        if (!data?.length) throw new ErroConta('Código da turma não encontrado. Confira com seu professor.');
      }
      const { data, error } = await supabase.auth.signUp({
        email: emailLimpo,
        password: senha,
        options: { data: { tipo, nome: nomeLimpo, codigo_turma: codigo }, emailRedirectTo: `${location.origin}/app/` },
      });
      if (error) falha(error, 'Não consegui criar a conta.');
      // Sem sessão: o projeto exige confirmar o e-mail. (Se o e-mail já existia, o Supabase também cai aqui.)
      if (!data.session) throw new ConfirmeEmail(`Enviamos um e-mail para ${emailLimpo}. Clique no link para ativar a conta e depois entre.`);
      return contaObrigatoria();
    },

    async entrar(email, senha) {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizarEmail(email), password: senha });
      if (error) falha(error, 'Não consegui entrar.');
      return contaObrigatoria();
    },

    async sair() {
      await supabase.auth.signOut();
    },

    async atualizarPerfil(id, { nome, voz, objetivo }) {
      if (!nome.trim()) throw new ErroConta('Informe seu nome.');
      const { data, error } = await supabase
        .from('contas')
        .update({ nome: nome.trim(), voz, objetivo: objetivo.trim() })
        .eq('id', id)
        .select('*')
        .single<LinhaConta>();
      if (error) falha(error, 'Não consegui salvar o perfil.');
      return conta(data);
    },

    async turma(professorId): Promise<Turma> {
      const [alunos, convites, fichas, aulas] = await Promise.all([
        supabase.from('contas').select('*').eq('professor_id', professorId).order('nome'),
        supabase.from('convites').select('*').eq('professor_id', professorId).order('criado_em'),
        supabase.from('fichas').select('*').eq('professor_id', professorId),
        supabase.from('aulas').select('*').eq('professor_id', professorId),
      ]);
      for (const r of [alunos, convites, fichas, aulas]) if (r.error) falha(r.error, 'Não consegui carregar a turma.');
      return {
        alunos: (alunos.data as LinhaConta[]).map(conta),
        convites: (convites.data as LinhaConvite[]).map(convite),
        fichas: (fichas.data as LinhaFicha[]).map(ficha),
        aulas: ordenar((aulas.data as LinhaAula[]).map(aula)),
      };
    },

    async convidarAluno(professorId, nome, email, telefone = '') {
      const { data, error } = await supabase.rpc('convidar_aluno', { nome, email, telefone });
      if (error) falha(error, 'Não consegui convidar.');
      return { id: data as string, professorId, nome: nome.trim(), email: normalizarEmail(email), criadoEm: Date.now() };
    },

    async salvarFicha(professorId, alunoEmail, { telefone, observacoes }) {
      const linha = { professor_id: professorId, aluno_email: normalizarEmail(alunoEmail), telefone: telefone.trim(), observacoes: observacoes.trim() };
      const { data, error } = await supabase.from('fichas').upsert(linha).select('*').single<LinhaFicha>();
      if (error) falha(error, 'Não consegui salvar a ficha.');
      return ficha(data);
    },

    async salvarAula(professorId, dados) {
      const erro = validarHorario(dados);
      if (erro) throw new ErroConta(erro);
      const t = await servidor.turma(professorId);
      const email = normalizarEmail(dados.alunoEmail);
      const nomes = new Map([...t.convites.map((c) => [c.email, c.nome] as const), ...t.alunos.map((a) => [a.email, a.nome] as const)]);
      if (!nomes.has(email)) throw new ErroConta('Escolha um aluno da sua turma.');
      // Confere o conflito antes, para dizer com quem bate (o banco também confere).
      const choque = conflito({ ...dados, id: dados.id }, t.aulas);
      if (choque) throw new ErroConta(`Esse horário bate com a aula de ${nomes.get(choque.alunoEmail) ?? choque.alunoEmail} (${descrever(choque)}).`);
      const linha = {
        professor_id: professorId,
        aluno_email: email,
        dia: dados.dia,
        inicio: dados.inicio,
        duracao: dados.duracao,
        modalidade: dados.modalidade === 'online' ? 'online' : 'presencial',
        local: dados.local.trim(),
      };
      const consulta = dados.id ? supabase.from('aulas').update(linha).eq('id', dados.id) : supabase.from('aulas').insert(linha);
      const { data, error } = await consulta.select('*').single<LinhaAula>();
      if (error?.code === '23P01') throw new ErroConta('Esse horário bate com outra aula sua.');
      if (error) falha(error, 'Não consegui salvar a aula.');
      return aula(data);
    },

    async excluirAula(_professorId, aulaId) {
      const { error } = await supabase.from('aulas').delete().eq('id', aulaId);
      if (error) falha(error, 'Não consegui excluir a aula.');
    },

    async cancelarConvite(_professorId, conviteId) {
      const { error } = await supabase.rpc('cancelar_convite', { convite: conviteId });
      if (error) falha(error, 'Não consegui cancelar o convite.');
    },

    async removerDaTurma(_professorId, alunoId) {
      const { error } = await supabase.rpc('remover_da_turma', { aluno: alunoId });
      if (error) falha(error, 'Não consegui remover o aluno.');
    },

    async professorDe(aluno) {
      if (!aluno.professorId) return null;
      const { data, error } = await supabase.from('contas').select('*').eq('id', aluno.professorId).maybeSingle<LinhaConta>();
      if (error) falha(error);
      return data ? conta(data) : null;
    },

    async aulasDoAluno(aluno) {
      if (!aluno.professorId) return [];
      const { data, error } = await supabase.from('aulas').select('*').eq('professor_id', aluno.professorId).eq('aluno_email', aluno.email);
      if (error) falha(error, 'Não consegui carregar suas aulas.');
      return ordenar((data as LinhaAula[]).map(aula));
    },

    async convitesPara() {
      const { data, error } = await supabase.rpc('meus_convites');
      if (error) falha(error);
      return ((data ?? []) as (LinhaConvite & { professor_nome: string })[]).map((l) => ({ ...convite(l), professorNome: l.professor_nome }));
    },

    async aceitarConvite(_alunoId, conviteId) {
      const { error } = await supabase.rpc('aceitar_convite', { convite: conviteId });
      if (error) falha(error, 'Não consegui aceitar o convite.');
      return contaObrigatoria();
    },

    async entrarNaTurma(_alunoId, codigo) {
      const { error } = await supabase.rpc('entrar_na_turma', { codigo: normalizarCodigo(codigo) });
      if (error) falha(error, 'Não consegui entrar na turma.');
      return contaObrigatoria();
    },

    async sairDaTurma() {
      const { error } = await supabase.rpc('sair_da_turma');
      if (error) falha(error, 'Não consegui sair da turma.');
      return contaObrigatoria();
    },
  };
  return servidor;
}
