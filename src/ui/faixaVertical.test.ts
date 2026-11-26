import { describe, expect, it } from 'vitest';
import { planejarFaixas, type NotaAltura } from './faixaVertical';

/** Uma frase de 5 notas (1-2-3-4-5) começando em `tonica`, a partir do instante `t`. */
function frase(tonica: number, t: number): NotaAltura[] {
  return [0, 2, 4, 5, 7].map((g, i) => ({ inicio: t + i * 0.3, fim: t + i * 0.3 + 0.25, altura: tonica + g }));
}

describe('planejarFaixas', () => {
  it('usa uma faixa só quando o exercício inteiro cabe (Dó3 a Sol4)', () => {
    const notas = [0, 2, 4, 5, 7, 9, 11, 12].flatMap((s, k) => frase(48 + s, k * 3));
    const faixaEm = planejarFaixas(notas);
    const primeira = faixaEm(0);
    for (let t = 0; t < 25; t += 0.5) expect(faixaEm(t)).toBe(primeira);
    expect(primeira.lo).toBeLessThanOrEqual(48 - 1);
    expect(primeira.hi).toBeGreaterThanOrEqual(48 + 12 + 7 + 1);
  });

  it('em exercícios grandes, só muda de faixa quando a frase não cabe', () => {
    // Sobe meio tom a cada frase, de Dó3 até Dó5: não cabe numa faixa só.
    const notas = Array.from({ length: 25 }, (_, k) => frase(48 + k, k * 3)).flat();
    const faixaEm = planejarFaixas(notas);
    const mudancas = new Set<object>();
    for (let t = 0; t < 75; t += 0.1) mudancas.add(faixaEm(t));
    // Poucas mudanças (cerca de uma a cada 4 ou 5 frases), não uma por frase.
    expect(mudancas.size).toBeGreaterThan(1);
    expect(mudancas.size).toBeLessThanOrEqual(5);
    // Toda nota aparece dentro da faixa no instante em que soa.
    for (const n of notas) {
      const f = faixaEm(n.inicio);
      expect(n.altura).toBeGreaterThanOrEqual(f.lo);
      expect(n.altura).toBeLessThanOrEqual(f.hi);
    }
  });

  it('mostra pelo menos uma oitava, mesmo com notas próximas', () => {
    const f = planejarFaixas(frase(60, 0))(0);
    expect(f.hi - f.lo).toBeGreaterThanOrEqual(12);
  });

  it('não quebra sem notas', () => {
    const f = planejarFaixas([])(10);
    expect(f.hi).toBeGreaterThan(f.lo);
  });
});
