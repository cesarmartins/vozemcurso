import { criarDetector } from '../audio/altura';
import { freqParaMidi } from '../musica/notas';

// Extrai a melodia (uma nota por vez) de uma gravação de piano.
// O áudio chega reamostrado a 16 kHz: sobra para piano e voz e fica ~9x mais rápido que 48 kHz.

export const TAXA_ANALISE = 16_000;
const JANELA_S = 0.08; // mais ciclos por quadro ajudam a estabilizar o piano, sobretudo nas notas graves
const PASSO_S = 0.01;
const CLAREZA_MIN = 0.82;
const FAIXA_DINAMICA_DB = 30; // ignora o que estiver 30 dB abaixo do trecho mais forte
const DURACAO_MIN = 0.09;
const FALHA_MAX = 3; // quadros sem nota tolerados dentro de uma nota
const TRANSIENTE_MAX = 0.13; // trechos curtos entre duas ocorrências da mesma nota tendem a ser erros do detector
// Só é erro do detector se o salto for grande (quinta, oitava). Trinados de 1 ou 2 semitons são música.
const TRANSIENTE_SALTO_MIN = 5;
// Baixo dos acordes entre repetições: nota longe da mediana das vizinhas.
const ACORDE_RAIO_S = 4;
const ACORDE_DISTANCIA_MAX = 9;

export interface NotaPiano {
  inicio: number;
  fim: number;
  /** Nota inteira (MIDI). */
  midi: number;
}

export interface Quadro {
  t: number;
  midi: number | null;
}

export function detectarQuadros(amostras: Float32Array, taxa: number, a4: number, progresso?: (fracao: number) => void): Quadro[] {
  const JANELA = Math.round(taxa * JANELA_S);
  const PASSO = Math.round(taxa * PASSO_S);
  const detectar = criarDetector(JANELA);
  const total = Math.max(0, Math.floor((amostras.length - JANELA) / PASSO) + 1);
  const energia = new Float32Array(total);
  let maxDb = -Infinity;
  for (let i = 0; i < total; i++) {
    const ini = i * PASSO;
    let s = 0;
    for (let j = ini; j < ini + JANELA; j++) s += amostras[j] * amostras[j];
    energia[i] = 10 * Math.log10(s / JANELA + 1e-12);
    if (energia[i] > maxDb) maxDb = energia[i];
  }
  const limiar = maxDb - FAIXA_DINAMICA_DB;
  const quadros: Quadro[] = [];
  for (let i = 0; i < total; i++) {
    let midi: number | null = null;
    if (energia[i] > limiar) {
      const r = detectar(amostras.subarray(i * PASSO, i * PASSO + JANELA), taxa);
      if (r && r.clareza > CLAREZA_MIN && r.freq > 60 && r.freq < 1500) midi = freqParaMidi(r.freq, a4);
    }
    quadros.push({ t: (i * PASSO + JANELA / 2) / taxa, midi });
    if (progresso && i % 200 === 0) progresso(i / total);
  }
  return corrigirQuadrosIsolados(quadros);
}

/** Preenche uma falha ou corrige um salto de um quadro quando os vizinhos concordam. */
function corrigirQuadrosIsolados(quadros: Quadro[]): Quadro[] {
  const saida = quadros.map((q) => ({ ...q }));
  for (let i = 1; i < quadros.length - 1; i++) {
    const antes = quadros[i - 1].midi;
    const atual = quadros[i].midi;
    const depois = quadros[i + 1].midi;
    if (antes == null || depois == null || Math.abs(antes - depois) > 0.45) continue;
    if (atual == null || Math.abs(atual - (antes + depois) / 2) > 0.75) {
      saida[i].midi = (antes + depois) / 2;
    }
  }
  return saida;
}

/** Junta quadros seguidos na mesma nota e descarta trechos curtos demais. */
export function segmentar(quadros: Quadro[]): NotaPiano[] {
  const passo = quadros.length > 1 ? quadros[1].t - quadros[0].t : PASSO_S;
  const notas: NotaPiano[] = [];
  let atual: NotaPiano | null = null;
  const fechar = () => {
    if (atual && atual.fim - atual.inicio >= DURACAO_MIN) notas.push(atual);
    atual = null;
  };
  for (const q of quadros) {
    const k = q.midi == null ? null : Math.round(q.midi);
    if (k != null && atual && k === atual.midi && q.t - atual.fim <= FALHA_MAX * passo + 1e-6) {
      atual.fim = q.t + passo;
    } else if (k != null) {
      fechar();
      atual = { inicio: q.t, fim: q.t + passo, midi: k };
    } else if (atual && q.t - atual.fim > FALHA_MAX * passo) {
      fechar();
    }
  }
  fechar();
  return removerBaixoDosAcordes(removerTransientesIsolados(notas));
}

/**
 * Tira o baixo dos acordes tocados entre as repetições: notas mais de 9 semitons
 * longe da mediana das notas num raio de 4 s.
 */
function removerBaixoDosAcordes(notas: NotaPiano[]): NotaPiano[] {
  return notas.filter((n) => {
    const vizinhas = notas
      .filter((v) => Math.abs(v.inicio - n.inicio) < ACORDE_RAIO_S)
      .map((v) => v.midi)
      .sort((a, b) => a - b);
    return Math.abs(n.midi - vizinhas[vizinhas.length >> 1]) <= ACORDE_DISTANCIA_MAX;
  });
}

/**
 * Afinação do piano gravado, em cents em relação ao Lá de referência.
 * Um piano afinado em 442 Hz, por exemplo, dá cerca de +8 cents.
 * Usa a mediana dos quadros com nota, que ignora os erros isolados.
 */
export function estimarAfinacao(quadros: Quadro[]): number {
  const desvios = quadros.flatMap((q) => (q.midi == null ? [] : [(q.midi - Math.round(q.midi)) * 100])).sort((a, b) => a - b);
  return desvios.length ? desvios[desvios.length >> 1] : 0;
}

/** Remove saltos breves que retornam à mesma nota, preservando saltos sustentados da melodia. */
function removerTransientesIsolados(notas: NotaPiano[]): NotaPiano[] {
  const resultado: NotaPiano[] = [];
  for (let i = 0; i < notas.length; i++) {
    const atual = notas[i];
    const anterior = resultado[resultado.length - 1];
    const seguinte = notas[i + 1];
    const duracao = atual.fim - atual.inicio;
    if (
      anterior && seguinte &&
      duracao <= TRANSIENTE_MAX &&
      anterior.midi === seguinte.midi &&
      Math.abs(atual.midi - anterior.midi) >= TRANSIENTE_SALTO_MIN
    ) {
      anterior.fim = seguinte.fim;
      i++;
      continue;
    }
    resultado.push({ ...atual });
  }
  return resultado;
}
