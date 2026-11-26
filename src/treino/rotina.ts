// Rotina de treino, no estilo academia: primeiro os aparelhos, depois a técnica,
// depois os exercícios que o professor mandou e, no fim, o desaquecimento.

import { duracaoDe, padraoPorId, type ExercicioPadrao } from './padroes';

/** Exercício da biblioteca do professor (ou do próprio aluno independente) marcado para a rotina. */
export interface ExercicioEnviado {
  id: string;
  nome: string;
  categoria: string;
  equipamento: string;
  obterAudio: () => Promise<Blob>;
}

export type Passo =
  | { id: string; tipo: 'padrao'; bloco: Bloco; exercicio: ExercicioPadrao }
  | { id: string; tipo: 'professor'; bloco: Bloco; exercicio: ExercicioEnviado };

/** 'extra': exercício aberto fora da rotina; não conta para concluir o treino. */
export type Bloco = 'aparelhos' | 'tecnica' | 'professor' | 'final' | 'extra';

export const NOMES_BLOCO: Record<Bloco, string> = {
  aparelhos: 'Respiração e aparelhos',
  tecnica: 'Aquecimento e técnica',
  professor: 'Exercícios do professor',
  final: 'Desaquecimento',
  extra: 'Extras de hoje',
};

/** A rotina padrão Voz em Curso (cerca de 20 minutos, sem contar os exercícios do professor). */
export const ROTINA_PADRAO: { bloco: Bloco; ids: string[] }[] = [
  { bloco: 'aparelhos', ids: ['respiracao-sss', 'canudo-continuo', 'canudo-sirene', 'laxvox'] },
  { bloco: 'tecnica', ids: ['vibracao-labios', 'escala-5-notas', 'trava-linguas'] },
  { bloco: 'professor', ids: [] },
  { bloco: 'final', ids: ['bocejo-suspiro'] },
];

/** Tempo considerado para cada exercício do professor (áudio de piano), em segundos. */
export const TEMPO_EXERCICIO_PROFESSOR = 180;

export function montarRotina(enviados: ExercicioEnviado[]): Passo[] {
  const passos: Passo[] = [];
  for (const { bloco, ids } of ROTINA_PADRAO) {
    if (bloco === 'professor') {
      for (const e of enviados) passos.push({ id: `prof:${e.id}`, tipo: 'professor', bloco, exercicio: e });
      continue;
    }
    for (const id of ids) {
      const exercicio = padraoPorId.get(id);
      if (exercicio) passos.push({ id: `padrao:${id}`, tipo: 'padrao', bloco, exercicio });
    }
  }
  return passos;
}

export const duracaoPasso = (p: Passo) => (p.tipo === 'padrao' ? duracaoDe(p.exercicio) : TEMPO_EXERCICIO_PROFESSOR);

// ---------- Progresso ----------

export type Estado = 'feito' | 'pulado';

export interface Progresso {
  /** data (AAAA-MM-DD) → passo → estado */
  dias: Record<string, Record<string, Estado>>;
  /** Dias em que o treino foi concluído. */
  concluidos: string[];
}

/** "2026-11-26" no fuso do aparelho (não em UTC: o treino das 23h conta no dia certo). */
export function dataLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diaAnterior(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  return dataLocal(new Date(a, m - 1, d - 1));
}

/** Quantos dias seguidos de treino, contando até hoje (ou até ontem, se hoje ainda não treinou). */
export function sequencia(concluidos: string[], hoje: string): number {
  const dias = new Set(concluidos);
  let dia = dias.has(hoje) ? hoje : diaAnterior(hoje);
  let n = 0;
  while (dias.has(dia)) {
    n++;
    dia = diaAnterior(dia);
  }
  return n;
}

/** Treinos concluídos nos últimos 7 dias (incluindo hoje). */
export function naSemana(concluidos: string[], hoje: string): number {
  const dias = new Set(concluidos);
  let dia = hoje;
  let n = 0;
  for (let i = 0; i < 7; i++) {
    if (dias.has(dia)) n++;
    dia = diaAnterior(dia);
  }
  return n;
}

const chave = (contaId: string) => `vozemcurso-treino-${contaId}`;

export function lerProgresso(contaId: string): Progresso {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(chave(contaId)) ?? 'null');
    if (v && typeof v === 'object' && 'dias' in v && 'concluidos' in v) return v as Progresso;
  } catch {
    // dados locais inválidos: começa do zero
  }
  return { dias: {}, concluidos: [] };
}

function gravar(contaId: string, p: Progresso) {
  // Guarda só os últimos 60 dias de detalhe; os dias concluídos ficam todos (para a sequência).
  const datas = Object.keys(p.dias).sort();
  for (const d of datas.slice(0, Math.max(0, datas.length - 60))) delete p.dias[d];
  try {
    localStorage.setItem(chave(contaId), JSON.stringify(p));
  } catch {
    // sem armazenamento: vale até recarregar
  }
}

export function marcar(contaId: string, data: string, passoId: string, estado: Estado | null): Progresso {
  const p = lerProgresso(contaId);
  const dia = (p.dias[data] ??= {});
  if (estado) dia[passoId] = estado;
  else delete dia[passoId];
  gravar(contaId, p);
  return p;
}

/** Marca o treino do dia como concluído (quando todos os passos foram feitos ou pulados). */
export function concluirDia(contaId: string, data: string): Progresso {
  const p = lerProgresso(contaId);
  if (!p.concluidos.includes(data)) p.concluidos.push(data);
  gravar(contaId, p);
  return p;
}

/** Zera os passos marcados hoje para treinar de novo. O dia continua contando como concluído. */
export function reiniciarDia(contaId: string, data: string): Progresso {
  const p = lerProgresso(contaId);
  delete p.dias[data];
  gravar(contaId, p);
  return p;
}
