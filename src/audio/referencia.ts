import { midiParaFreq } from '../musica/notas';
import { audio } from './contexto';

/** Toca uma nota de referência (onda triangular, ~1,8 s). */
export function tocarNota(midi: number, a4: number) {
  const ctx = audio();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = midiParaFreq(midi, a4);
  ganho.gain.setValueAtTime(0, t);
  ganho.gain.linearRampToValueAtTime(0.28, t + 0.04);
  ganho.gain.setValueAtTime(0.28, t + 1.2);
  ganho.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  osc.connect(ganho).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 1.85);
}
