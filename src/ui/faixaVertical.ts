// Decide quais notas o gráfico do exercício mostra no eixo vertical.
// A faixa depende só das notas do piano (nunca da voz) e fica parada:
// - se o exercício inteiro cabe na tela, uma faixa só para tudo;
// - se não cabe, uma faixa por frase, que só muda quando a frase seguinte não cabe na atual.

export interface Faixa {
  lo: number;
  hi: number;
}

export interface NotaAltura {
  inicio: number;
  fim: number;
  /** Altura em MIDI (pode ser fracionária). */
  altura: number;
}

/** Semitons de folga acima e abaixo das notas. */
const MARGEM = 2;
/** Altura mínima da faixa, em semitons (uma oitava). */
const FAIXA_MIN = 12;
/** Até quantos semitons a faixa pode ser fixa no exercício todo sem as notas ficarem pequenas demais. */
const FAIXA_FIXA_MAX = 26;
/** Silêncio do piano que separa uma frase da outra, em segundos. */
const PAUSA_FRASE = 0.8;
/** Altura de cada "página" quando o exercício não cabe numa faixa só: espaço para as frases seguintes. */
const FAIXA_PAGINA = 16;
/** Antecipação: a faixa da próxima frase entra antes, para a pessoa ver as notas que vêm. */
const ANTECIPA = 1.5;

function faixaPara(min: number, max: number): Faixa {
  const altura = Math.max(FAIXA_MIN, max - min + 2 * MARGEM);
  const meio = (min + max) / 2;
  return { lo: meio - altura / 2, hi: meio + altura / 2 };
}

const cabe = (f: Faixa, min: number, max: number) => min >= f.lo + 1 && max <= f.hi - 1;

/**
 * Nova faixa para uma frase que não coube na anterior. Fica encostada do lado
 * de onde o exercício veio: subindo, a frase fica embaixo e sobra espaço para as próximas.
 */
function novaPagina(min: number, max: number, anterior?: Faixa): Faixa {
  const altura = Math.max(FAIXA_PAGINA, max - min + 2 * MARGEM);
  if (anterior && max > anterior.hi - 1) return { lo: min - MARGEM, hi: min - MARGEM + altura };
  if (anterior && min < anterior.lo + 1) return { lo: max + MARGEM - altura, hi: max + MARGEM };
  const meio = (min + max) / 2;
  return { lo: meio - altura / 2, hi: meio + altura / 2 };
}

/** Devolve uma função que dá a faixa a mostrar em cada instante do exercício. */
export function planejarFaixas(notas: NotaAltura[]): (t: number) => Faixa {
  if (!notas.length) return () => ({ lo: 54, hi: 66 });

  let min = Infinity;
  let max = -Infinity;
  for (const n of notas) {
    min = Math.min(min, n.altura);
    max = Math.max(max, n.altura);
  }
  if (max - min + 2 * MARGEM <= FAIXA_FIXA_MAX) {
    const fixa = faixaPara(min, max);
    return () => fixa;
  }

  // Frases: grupos de notas separados por silêncio.
  const frases: { inicio: number; min: number; max: number }[] = [];
  let fimAnterior = -Infinity;
  for (const n of notas) {
    const atual = frases[frases.length - 1];
    if (!atual || n.inicio - fimAnterior > PAUSA_FRASE) frases.push({ inicio: n.inicio, min: n.altura, max: n.altura });
    else {
      atual.min = Math.min(atual.min, n.altura);
      atual.max = Math.max(atual.max, n.altura);
    }
    fimAnterior = Math.max(fimAnterior, n.fim);
  }

  // Cada frase herda a faixa anterior se couber nela; assim o gráfico só se mexe quando precisa.
  const trechos: { desde: number; faixa: Faixa }[] = [];
  for (const f of frases) {
    const anterior = trechos[trechos.length - 1]?.faixa;
    const faixa = anterior && cabe(anterior, f.min, f.max) ? anterior : novaPagina(f.min, f.max, anterior);
    if (faixa !== anterior) trechos.push({ desde: trechos.length ? f.inicio - ANTECIPA : -Infinity, faixa });
  }

  return (t: number) => {
    let escolhida = trechos[0].faixa;
    for (const tr of trechos) {
      if (t >= tr.desde) escolhida = tr.faixa;
      else break;
    }
    return escolhida;
  };
}
