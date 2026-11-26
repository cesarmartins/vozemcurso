import { criarDetector } from '../audio/altura';
import { TAMANHO_JANELA } from '../audio/Microfone';
import { freqParaMidi } from '../musica/notas';

export interface Ponto {
  t: number;
  midi: number | null;
  db: number;
}

export interface Ajustes {
  a4: number;
  /** Abaixo deste volume (dBFS) não se tenta achar nota. */
  limiarDb: number;
}

export const JANELA_MS = 10_000;
const CLAREZA_MIN = 0.82;
const FREQ_MIN = 60;
const FREQ_MAX = 1300;
/** Quadros seguidos na mesma nota para ela contar na extensão (~170 ms a 60 fps). */
const QUADROS_PARA_FIXAR = 10;
const PICO_SEGURA_MS = 1500;
const SILENCIO = -100;

/** Transforma cada quadro do microfone em nota, volume e estatísticas da sessão. */
export class Analise {
  readonly historico: Ponto[] = [];
  midi: number | null = null;
  dbSuave = SILENCIO;
  pico = SILENCIO;
  maximo = SILENCIO;
  grave: number | null = null;
  aguda: number | null = null;

  private picoEm = 0;
  private somaDb = 0;
  private quadrosCantando = 0;
  private recentes: number[] = [];
  private notaEstavel: number | null = null;
  private contagem = 0;
  private detectar = criarDetector(TAMANHO_JANELA);

  get media(): number | null {
    return this.quadrosCantando ? this.somaDb / this.quadrosCantando : null;
  }

  /** Retorna true quando a extensão vocal mudou neste quadro. */
  processar(b: Float32Array, taxa: number, agora: number, aj: Ajustes): boolean {
    let soma = 0;
    let picoQuadro = 0;
    for (let i = 0; i < b.length; i++) {
      const v = b[i];
      soma += v * v;
      const a = Math.abs(v);
      if (a > picoQuadro) picoQuadro = a;
    }
    const db = soma > 0 ? 10 * Math.log10(soma / b.length) : SILENCIO;
    const picoDb = picoQuadro > 0 ? 20 * Math.log10(picoQuadro) : SILENCIO;

    // Sobe rápido, desce devagar, como um VU.
    this.dbSuave += (db - this.dbSuave) * (db > this.dbSuave ? 0.5 : 0.1);
    if (picoDb > this.pico || agora - this.picoEm > PICO_SEGURA_MS) {
      this.pico = picoDb;
      this.picoEm = agora;
    }

    let bruto: number | null = null;
    if (db > aj.limiarDb) {
      const r = this.detectar(b, taxa);
      if (r && r.clareza > CLAREZA_MIN && r.freq > FREQ_MIN && r.freq < FREQ_MAX) bruto = freqParaMidi(r.freq, aj.a4);
    }

    // Mediana dos últimos 5 quadros tira saltos isolados.
    if (bruto != null) {
      this.recentes.push(bruto);
      if (this.recentes.length > 5) this.recentes.shift();
    } else this.recentes.length = 0;
    this.midi = null;
    if (this.recentes.length >= 3) {
      const ord = [...this.recentes].sort((x, y) => x - y);
      this.midi = ord[ord.length >> 1];
    }

    let extensaoMudou = false;
    if (this.midi != null) {
      if (db > this.maximo) this.maximo = db;
      this.somaDb += db;
      this.quadrosCantando++;
      const nota = Math.round(this.midi);
      if (nota === this.notaEstavel) this.contagem++;
      else {
        this.notaEstavel = nota;
        this.contagem = 1;
      }
      if (this.contagem === QUADROS_PARA_FIXAR) {
        if (this.grave == null || nota < this.grave) this.grave = nota;
        if (this.aguda == null || nota > this.aguda) this.aguda = nota;
        extensaoMudou = true;
      }
    } else {
      this.notaEstavel = null;
      this.contagem = 0;
    }

    this.historico.push({ t: agora, midi: this.midi, db });
    while (this.historico.length && this.historico[0].t < agora - JANELA_MS) this.historico.shift();
    return extensaoMudou;
  }

  zerarSessao() {
    this.grave = this.aguda = null;
    this.maximo = SILENCIO;
    this.somaDb = 0;
    this.quadrosCantando = 0;
  }
}
