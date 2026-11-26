import { describe, expect, it } from 'vitest';
import { freqParaMidi } from '../musica/notas';
import { criarDetector } from './altura';

function tom(freq: number, taxa: number, n: number, harmonicos = [1, 0.6, 0.3]) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    harmonicos.forEach((a, k) => (v += a * Math.sin(2 * Math.PI * freq * (k + 1) * (i / taxa))));
    b[i] = v * 0.3;
  }
  return b;
}

describe('criarDetector', () => {
  const detectar = criarDetector(2048);

  for (const taxa of [44_100, 48_000]) {
    for (const freq of [82.41, 130.81, 261.63, 440, 659.26, 1046.5]) {
      it(`acerta ${freq} Hz a ${taxa} Hz com erro menor que 3 cents`, () => {
        const r = detectar(tom(freq, taxa, 2048), taxa);
        expect(r).not.toBeNull();
        expect(Math.abs(freqParaMidi(r!.freq, 440) - freqParaMidi(freq, 440)) * 100).toBeLessThan(3);
        expect(r!.clareza).toBeGreaterThan(0.9);
      });
    }
  }

  it('não confunde a fundamental com a oitava quando o 2º harmônico é mais forte', () => {
    const r = detectar(tom(220, 48_000, 2048, [0.5, 1, 0.4]), 48_000);
    expect(Math.round(freqParaMidi(r!.freq, 440))).toBe(57);
  });

  it('dá clareza baixa para ruído', () => {
    let x = 1;
    const ruido = new Float32Array(2048).map(() => ((x = (x * 16807) % 2147483647) / 2147483647 - 0.5) * 0.5);
    const r = detectar(ruido, 48_000);
    expect(r == null || r.clareza < 0.8).toBe(true);
  });
});
