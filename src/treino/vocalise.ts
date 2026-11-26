// Gera o áudio de piano dos vocalises padrão direto no navegador, sem precisar de gravação.
// O resultado é um WAV comum, que entra no mesmo fluxo dos exercícios gravados
// (análise das notas, gráfico e placar).

import { midiParaFreq } from '../musica/notas';
import type { ExercicioVocalise } from './padroes';

export interface NotaGerada {
  midi: number;
  inicio: number;
  duracao: number;
}

/** Respiro entre uma repetição e outra, em segundos. */
const RESPIRO = 1.2;
const TAXA = 22_050;

/** Nota de partida conforme a voz do aluno: vozes femininas mais agudas, masculinas mais graves. */
export function tonicaPara(voz: string): number {
  if (/soprano|mezzo|contralto/i.test(voz)) return 57; // Lá2… (as vozes femininas cantam uma oitava acima no gráfico)
  if (/tenor|bar[ií]tono|baixo/i.test(voz)) return 48; // Dó3
  return 52; // Mi3: meio-termo quando a voz ainda não foi classificada
}

/** As notas do vocalise: sobe meio tom a cada repetição e depois desce de volta à tônica. */
export function notasDoVocalise(e: Pick<ExercicioVocalise, 'padrao' | 'nota' | 'subidas'>, tonica: number): NotaGerada[] {
  const transposicoes = [...Array.from({ length: e.subidas + 1 }, (_, i) => i), ...Array.from({ length: e.subidas }, (_, i) => e.subidas - 1 - i)];
  const notas: NotaGerada[] = [];
  let t = 0.6; // um instante antes de começar
  for (const tr of transposicoes) {
    for (const grau of e.padrao) {
      notas.push({ midi: tonica + tr + grau, inicio: t, duracao: e.nota });
      t += e.nota;
    }
    t += RESPIRO;
  }
  return notas;
}

/** WAV PCM 16 bits, mono. */
export function codificarWav(amostras: Float32Array, taxa: number): Blob {
  const dados = new DataView(new ArrayBuffer(44 + amostras.length * 2));
  const texto = (pos: number, s: string) => [...s].forEach((c, i) => dados.setUint8(pos + i, c.charCodeAt(0)));
  texto(0, 'RIFF');
  dados.setUint32(4, 36 + amostras.length * 2, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  dados.setUint32(16, 16, true);
  dados.setUint16(20, 1, true); // PCM
  dados.setUint16(22, 1, true); // mono
  dados.setUint32(24, taxa, true);
  dados.setUint32(28, taxa * 2, true);
  dados.setUint16(32, 2, true);
  dados.setUint16(34, 16, true);
  texto(36, 'data');
  dados.setUint32(40, amostras.length * 2, true);
  for (let i = 0; i < amostras.length; i++) {
    const v = Math.max(-1, Math.min(1, amostras[i]));
    dados.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([dados.buffer], { type: 'audio/wav' });
}

/** Toca as notas com um timbre simples de piano (ataque rápido e decaimento) e devolve um WAV. */
export async function gerarVocalise(notas: NotaGerada[], a4: number): Promise<Blob> {
  const fim = notas.reduce((m, n) => Math.max(m, n.inicio + n.duracao), 0) + 1;
  const ctx = new OfflineAudioContext(1, Math.ceil(fim * TAXA), TAXA);
  const saida = ctx.createGain();
  saida.gain.value = 0.5;
  saida.connect(ctx.destination);
  // Harmônicos com peso decrescente: soa como piano elétrico suave e é fácil de analisar.
  const harmonicos: [number, number][] = [
    [1, 1],
    [2, 0.35],
    [3, 0.12],
  ];
  for (const n of notas) {
    const f = midiParaFreq(n.midi, a4);
    const env = ctx.createGain();
    const fimNota = n.inicio + n.duracao;
    env.gain.setValueAtTime(0, n.inicio);
    env.gain.linearRampToValueAtTime(0.9, n.inicio + 0.012);
    env.gain.exponentialRampToValueAtTime(0.35, n.inicio + Math.min(0.4, n.duracao * 0.8));
    env.gain.setValueAtTime(0.35, Math.max(n.inicio + 0.02, fimNota - 0.06));
    env.gain.exponentialRampToValueAtTime(0.0001, fimNota + 0.05);
    env.connect(saida);
    for (const [mult, peso] of harmonicos) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = f * mult;
      g.gain.value = peso * 0.5;
      osc.connect(g).connect(env);
      osc.start(n.inicio);
      osc.stop(fimNota + 0.1);
    }
  }
  const buf = await ctx.startRendering();
  return codificarWav(buf.getChannelData(0), TAXA);
}
