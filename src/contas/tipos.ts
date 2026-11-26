// Contas do sistema. Há três jeitos de usar:
// - professor: tem a própria turma (alunos) e a própria biblioteca de exercícios;
// - aluno de professor: entrou na turma de um professor e pratica os exercícios dele;
// - aluno independente: estuda sem professor e monta a própria biblioteca.
// Cada professor só enxerga os próprios alunos; o aluno só enxerga o próprio professor.

import type { Aula } from '../agenda/horarios';

export type { Aula } from '../agenda/horarios';

export type TipoConta = 'professor' | 'aluno';

export interface Conta {
  id: string;
  tipo: TipoConta;
  nome: string;
  email: string;
  /** Só para alunos: o professor da turma, ou null para quem estuda sozinho. */
  professorId: string | null;
  /** Só para professores: código que o aluno digita para entrar na turma. */
  codigoTurma: string | null;
  voz: string;
  objetivo: string;
  criadoEm: number;
}

/** Aluno que o professor cadastrou e que ainda não criou a conta (ou não aceitou). */
export interface Convite {
  id: string;
  professorId: string;
  nome: string;
  email: string;
  criadoEm: number;
}

export interface NovaConta {
  tipo: TipoConta;
  nome: string;
  email: string;
  senha: string;
  /** Aluno: código da turma do professor (opcional). */
  codigoTurma?: string;
}

/** O que o professor anota sobre cada aluno (só o professor vê). */
export interface FichaAluno {
  professorId: string;
  alunoEmail: string;
  telefone: string;
  observacoes: string;
}

export type NovaAula = Omit<Aula, 'id' | 'professorId' | 'criadoEm'> & { id?: string };

export interface Turma {
  alunos: Conta[];
  convites: Convite[];
  fichas: FichaAluno[];
  aulas: Aula[];
}

export class ErroConta extends Error {}

/**
 * O que o app precisa do servidor. Hoje existe uma versão que guarda tudo no
 * navegador (local.ts); em produção, outra versão com a mesma interface fala com o banco.
 */
export interface Servidor {
  contaAtual(): Promise<Conta | null>;
  cadastrar(dados: NovaConta): Promise<Conta>;
  entrar(email: string, senha: string): Promise<Conta>;
  sair(): Promise<void>;
  atualizarPerfil(id: string, dados: Pick<Conta, 'nome' | 'voz' | 'objetivo'>): Promise<Conta>;

  // Professor
  turma(professorId: string): Promise<Turma>;
  convidarAluno(professorId: string, nome: string, email: string, telefone?: string): Promise<Convite>;
  salvarFicha(professorId: string, alunoEmail: string, dados: Pick<FichaAluno, 'telefone' | 'observacoes'>): Promise<FichaAluno>;
  /** Cria ou altera uma aula semanal. Recusa horário que bate com outra aula do professor. */
  salvarAula(professorId: string, aula: NovaAula): Promise<Aula>;
  excluirAula(professorId: string, aulaId: string): Promise<void>;
  cancelarConvite(professorId: string, conviteId: string): Promise<void>;
  removerDaTurma(professorId: string, alunoId: string): Promise<void>;

  // Aluno
  professorDe(aluno: Conta): Promise<Conta | null>;
  /** As aulas do aluno com o professor atual dele. */
  aulasDoAluno(aluno: Conta): Promise<Aula[]>;
  convitesPara(aluno: Conta): Promise<(Convite & { professorNome: string })[]>;
  aceitarConvite(alunoId: string, conviteId: string): Promise<Conta>;
  entrarNaTurma(alunoId: string, codigo: string): Promise<Conta>;
  sairDaTurma(alunoId: string): Promise<Conta>;
}
