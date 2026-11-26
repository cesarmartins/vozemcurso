import { describe, expect, it } from 'vitest';
import { cifra } from '../musica/notas';
import { detectarQuadros, estimarAfinacao, segmentar, type Quadro } from './extrairNotas';

const PASSO = 0.01;

/** Monta quadros de 10 ms a partir de trechos [nota MIDI ou null, duração em s]. */
function quadros(...trechos: [number | null, number][]): Quadro[] {
  const saida: Quadro[] = [];
  let t = 0;
  for (const [midi, dur] of trechos) {
    for (let i = 0; i < Math.round(dur / PASSO); i++) {
      saida.push({ t, midi });
      t += PASSO;
    }
  }
  return saida;
}

const nomes = (q: Quadro[]) => segmentar(q).map((n) => cifra(n.midi));

describe('segmentar', () => {
  it('mantém trinados rápidos de um tom (Dó-Ré-Dó-Ré)', () => {
    const q = quadros([48, 0.25], [50, 0.12], [48, 0.25], [50, 0.12], [48, 0.25]);
    expect(nomes(q)).toEqual(['C3', 'D3', 'C3', 'D3', 'C3']);
  });

  it('junta um erro de oitava curto à nota em volta', () => {
    const q = quadros([55, 0.3], [67, 0.1], [55, 0.3]);
    const notas = segmentar(q);
    expect(notas.map((n) => cifra(n.midi))).toEqual(['G3']);
    expect(notas[0].fim - notas[0].inicio).toBeGreaterThan(0.65);
  });

  it('tira o baixo dos acordes entre as repetições', () => {
    const repeticao: [number, number][] = [[48, 0.25], [50, 0.2], [52, 0.25], [53, 0.2], [55, 1]];
    const q = quadros(...repeticao, [null, 0.3], [38, 0.6], [null, 0.3], ...repeticao);
    expect(nomes(q)).not.toContain('D2');
    expect(nomes(q)).toHaveLength(10);
  });

  it('descarta trechos curtos demais', () => {
    expect(nomes(quadros([60, 0.05], [null, 0.2], [62, 0.3]))).toEqual(['D4']);
  });
});

describe('estimarAfinacao', () => {
  it('mede um piano 8 cents acima, ignorando falhas', () => {
    const q = quadros([60.08, 0.5], [null, 0.2], [64.08, 0.5], [71.5, 0.02]);
    expect(estimarAfinacao(q)).toBeCloseTo(8, 0);
  });

  it('devolve 0 sem nenhuma nota', () => {
    expect(estimarAfinacao(quadros([null, 1]))).toBe(0);
  });
});

describe('detectarQuadros', () => {
  it('acha a escala tocada num sinal sintético com harmônicos', () => {
    const taxa = 16_000;
    const escala = [48, 50, 52, 53, 55];
    const dur = 0.4;
    const amostras = new Float32Array(Math.round(taxa * dur * escala.length));
    escala.forEach((midi, k) => {
      const f = 440 * 2 ** ((midi - 69) / 12);
      const ini = Math.round(k * dur * taxa);
      for (let i = 0; i < dur * taxa; i++) {
        const t = i / taxa;
        const env = Math.exp(-2 * t);
        amostras[ini + i] = env * (0.5 * Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) + 0.1 * Math.sin(6 * Math.PI * f * t));
      }
    });
    const notas = segmentar(detectarQuadros(amostras, taxa, 440));
    expect(notas.map((n) => n.midi)).toEqual(escala);
  });
});
