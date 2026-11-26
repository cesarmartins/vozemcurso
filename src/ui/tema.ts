export interface Cores {
  fg: string;
  muted: string;
  line: string;
  good: string;
  warn: string;
  bad: string;
  accent: string;
}

/** Lê as cores do CSS para o canvas seguir o tema claro/escuro. */
export function lerCores(): Cores {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue('--' + n).trim();
  return { fg: v('fg'), muted: v('muted'), line: v('line'), good: v('good'), warn: v('warn'), bad: v('bad'), accent: v('accent') };
}

export type Faixa = 'good' | 'warn' | 'bad';

/** Verde até ±10 cents, amarelo até ±25, vermelho além disso. */
export function faixaCents(cents: number): Faixa {
  const a = Math.abs(cents);
  return a <= 10 ? 'good' : a <= 25 ? 'warn' : 'bad';
}
