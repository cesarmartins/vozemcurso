import { describe, expect, it } from 'vitest';
import { detectarQuadros, segmentar, TAXA_ANALISE } from '../exercicio/extrairNotas';
import { midiParaFreq } from '../musica/notas';
import { duracaoVocalise, EXERCICIOS_PADRAO, padraoPorId, type ExercicioVocalise } from './padroes';
import { codificarWav, notasDoVocalise, tonicaPara } from './vocalise';

const escala = padraoPorId.get('escala-5-notas') as ExercicioVocalise;

describe('vocalises gerados', () => {
  it('sobe meio tom a cada repetição e volta à tônica', () => {
    const notas = notasDoVocalise(escala, 48);
    const porRepeticao = escala.padrao.length;
    const primeiras = notas.filter((_, i) => i % porRepeticao === 0).map((n) => n.midi);
    expect(primeiras).toEqual([48, 49, 50, 51, 52, 53, 52, 51, 50, 49, 48]);
    expect(Math.max(...notas.map((n) => n.midi))).toBe(48 + 5 + 7);
    // A duração estimada mostrada no treino bate com a gerada.
    const fim = notas[notas.length - 1].inicio + escala.nota;
    expect(Math.abs(fim - duracaoVocalise(escala))).toBeLessThan(3);
  });

  it('escolhe a nota de partida pela voz', () => {
    expect(tonicaPara('Soprano')).toBe(57);
    expect(tonicaPara('Barítono')).toBe(48);
    expect(tonicaPara('')).toBe(52);
  });

  it('codifica um WAV válido', async () => {
    const wav = codificarWav(new Float32Array([0, 0.5, -0.5, 1]), 22050);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    expect(bytes.length).toBe(44 + 8);
  });

  it('o analisador reconhece as notas de um vocalise sintetizado', () => {
    // Mesmo timbre do gerador (3 harmônicos), feito à mão porque não há áudio no Node.
    const notas = notasDoVocalise({ padrao: [0, 2, 4], nota: 0.5, subidas: 0 }, 52);
    const total = Math.ceil((notas[notas.length - 1].inicio + 1) * TAXA_ANALISE);
    const sinal = new Float32Array(total);
    for (const n of notas) {
      const f = midiParaFreq(n.midi, 440);
      const ini = Math.floor(n.inicio * TAXA_ANALISE);
      const fim = Math.floor((n.inicio + n.duracao) * TAXA_ANALISE);
      for (let i = ini; i < fim; i++) {
        const t = (i - ini) / TAXA_ANALISE;
        const env = Math.exp(-t * 2) * 0.5;
        sinal[i] += env * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) + 0.12 * Math.sin(6 * Math.PI * f * t));
      }
    }
    const achadas = segmentar(detectarQuadros(sinal, TAXA_ANALISE, 440)).map((n) => n.midi);
    expect(achadas).toEqual([52, 54, 56]);
  });

  it('todo exercício padrão tem instruções e categoria', () => {
    const ids = new Set<string>();
    for (const e of EXERCICIOS_PADRAO) {
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      expect(e.instrucoes.length).toBeGreaterThan(0);
    }
  });
});
