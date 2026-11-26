// Regras dos horários de aula: aulas semanais fixas (mesmo dia e hora toda semana).

export type Modalidade = 'presencial' | 'online';

export interface Aula {
  id: string;
  professorId: string;
  /** O aluno é identificado pelo e-mail: vale tanto para quem já tem conta quanto para quem foi convidado. */
  alunoEmail: string;
  /** Dia da semana como em Date.getDay(): 0 = domingo, 1 = segunda … 6 = sábado. */
  dia: number;
  /** Hora de início, "HH:MM". */
  inicio: string;
  /** Duração em minutos. */
  duracao: number;
  modalidade: Modalidade;
  /** Sala, endereço ou link da chamada. */
  local: string;
  criadoEm: number;
}

export const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
/** A semana do professor começa na segunda. */
export const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

export const DURACAO_MIN = 15;
export const DURACAO_MAX = 240;
const DIA_MIN = 24 * 60;

/** "14:30" → 870. Devolve null se não for uma hora válida. */
export function minutos(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 870 → "14:30" */
export const hora = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const inicioMin = (a: Pick<Aula, 'inicio'>) => minutos(a.inicio) ?? 0;
export const fimMin = (a: Pick<Aula, 'inicio' | 'duracao'>) => inicioMin(a) + a.duracao;

/** "Seg 14:00–15:00" */
export const descrever = (a: Pick<Aula, 'dia' | 'inicio' | 'duracao'>) =>
  `${DIAS_CURTOS[a.dia]} ${hora(inicioMin(a))}–${hora(fimMin(a))}`;

/** "1h", "50 min", "1h30" */
export function duracaoTexto(min: number): string {
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (!h) return `${r} min`;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

type Horario = Pick<Aula, 'dia' | 'inicio' | 'duracao'> & { id?: string };

/** Duas aulas se sobrepõem se são no mesmo dia e os intervalos se cruzam (encostar não conta). */
export const sobrepoe = (a: Horario, b: Horario) => a.dia === b.dia && inicioMin(a) < fimMin(b) && inicioMin(b) < fimMin(a);

/** A primeira aula (de outro id) que bate com o horário, ou undefined. */
export const conflito = <T extends Horario>(nova: Horario, existentes: T[]): T | undefined =>
  existentes.find((e) => e.id !== nova.id && sobrepoe(nova, e));

/** Mensagem de erro para um horário inválido, ou null se estiver tudo certo. */
export function validarHorario(h: Pick<Aula, 'dia' | 'inicio' | 'duracao'>): string | null {
  if (!Number.isInteger(h.dia) || h.dia < 0 || h.dia > 6) return 'Escolha o dia da semana.';
  const ini = minutos(h.inicio);
  if (ini == null) return 'Informe a hora de início.';
  if (!Number.isFinite(h.duracao) || h.duracao < DURACAO_MIN || h.duracao > DURACAO_MAX) {
    return `A duração precisa ficar entre ${DURACAO_MIN} minutos e ${DURACAO_MAX / 60} horas.`;
  }
  if (ini + h.duracao > DIA_MIN) return 'A aula precisa terminar até meia-noite.';
  return null;
}

/** Ordena da segunda ao domingo e, no mesmo dia, pela hora. */
export function ordenar<T extends Pick<Aula, 'dia' | 'inicio'>>(aulas: T[]): T[] {
  const pos = (d: number) => ORDEM_SEMANA.indexOf(d as (typeof ORDEM_SEMANA)[number]);
  return [...aulas].sort((a, b) => pos(a.dia) - pos(b.dia) || inicioMin(a) - inicioMin(b));
}

/** Quando a aula acontece da próxima vez a partir de `agora` (inclui a que está em andamento). */
export function proximaVez(a: Pick<Aula, 'dia' | 'inicio' | 'duracao'>, agora: Date): Date {
  const data = new Date(agora);
  data.setSeconds(0, 0);
  const ini = inicioMin(a);
  let dias = (a.dia - agora.getDay() + 7) % 7;
  const minAgora = agora.getHours() * 60 + agora.getMinutes();
  if (dias === 0 && minAgora >= ini + a.duracao) dias = 7;
  data.setDate(data.getDate() + dias);
  data.setHours(Math.floor(ini / 60), ini % 60);
  return data;
}

/** As aulas na ordem em que vão acontecer a partir de agora. */
export function proximas<T extends Pick<Aula, 'dia' | 'inicio' | 'duracao'>>(aulas: T[], agora: Date): T[] {
  return [...aulas].sort((a, b) => proximaVez(a, agora).getTime() - proximaVez(b, agora).getTime());
}

/** Total de minutos de aula por semana. */
export const minutosPorSemana = (aulas: Pick<Aula, 'duracao'>[]) => aulas.reduce((s, a) => s + a.duracao, 0);
