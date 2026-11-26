// Detecção de altura pelo método McLeod (função de diferença quadrada normalizada).
// Funciona bem para voz: pega a fundamental mesmo com harmônicos fortes.

export interface Altura {
  freq: number;
  /** 0 a 1: quão periódico é o som. Voz cantada fica acima de 0,85. */
  clareza: number;
}

const FREQ_MIN = 60;

export function criarDetector(tamanho: number) {
  const nsdf = new Float32Array(tamanho);

  return function detectar(b: Float32Array, taxa: number): Altura | null {
    const n = b.length;
    const maxLag = Math.min(Math.floor(taxa / FREQ_MIN), n - 400, tamanho - 2);
    for (let t = 0; t <= maxLag; t++) {
      let acf = 0;
      let m = 0;
      for (let i = 0, L = n - t; i < L; i++) {
        const a = b[i];
        const c = b[i + t];
        acf += a * c;
        m += a * a + c * c;
      }
      nsdf[t] = m > 0 ? (2 * acf) / m : 0;
    }

    // Pula o lóbulo do atraso zero e guarda o máximo de cada trecho positivo.
    let t = 1;
    while (t < maxLag && nsdf[t] > 0) t++;
    const picos: number[] = [];
    let melhor = 0;
    for (; t < maxLag; t++) {
      if (nsdf[t] > 0) {
        let pk = t;
        while (t < maxLag && nsdf[t] > 0) {
          if (nsdf[t] > nsdf[pk]) pk = t;
          t++;
        }
        picos.push(pk);
        if (nsdf[pk] > melhor) melhor = nsdf[pk];
      }
    }
    if (!picos.length) return null;

    // O primeiro pico perto do maior evita erros de oitava.
    const p = picos.find((k) => nsdf[k] >= 0.9 * melhor) ?? picos[0];
    const y0 = nsdf[p - 1];
    const y1 = nsdf[p];
    const y2 = nsdf[p + 1];
    const den = y0 - 2 * y1 + y2;
    const d = den !== 0 ? Math.max(-1, Math.min(1, (y0 - y2) / (2 * den))) : 0;
    return { freq: taxa / (p + d), clareza: y1 };
  };
}
