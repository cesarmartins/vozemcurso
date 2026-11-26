// Notas em MIDI (60 = Dó4 = Dó central), nomes em português e em cifra.

export const NOMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'] as const;
export const LETRAS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
const NATURAIS = new Set([0, 2, 4, 5, 7, 9, 11]);

export const mod = (n: number, m: number) => ((n % m) + m) % m;
export const oitava = (midi: number) => Math.floor(midi / 12) - 1;
export const nome = (midi: number) => NOMES[mod(midi, 12)];
export const nomeNota = (midi: number) => nome(midi) + oitava(midi);
export const cifra = (midi: number) => LETRAS[mod(midi, 12)] + oitava(midi);
export const ehNatural = (midi: number) => NATURAIS.has(mod(midi, 12));
export const ehDo = (midi: number) => mod(midi, 12) === 0;

export const freqParaMidi = (freq: number, a4: number) => 69 + 12 * Math.log2(freq / a4);
export const midiParaFreq = (midi: number, a4: number) => a4 * Math.pow(2, (midi - 69) / 12);

/** Desvio em cents em relação à nota mais próxima (−50 a +50). */
export const centsDe = (midi: number) => (midi - Math.round(midi)) * 100;
