import { audio } from '../audio/contexto';
import type { Pedido, Resposta } from './analisador.worker';
import { TAXA_ANALISE, type NotaPiano } from './extrairNotas';

export interface PontoVoz {
  /** Segundos no tempo do exercício. */
  t: number;
  midi: number;
}

export interface Avaliacao {
  avaliadas: number;
  acertos: number;
  /** Média do desvio absoluto em cents, nas notas avaliadas. */
  desvioMedio: number | null;
}

/** Diferença em cents a partir da qual a nota é considerada errada. */
export const TOLERANCIA_ACERTO = 50;
/** Ignora o começo de cada nota: o tempo de reação de quem canta. */
const REACAO_S = 0.12;

/** Reamostra para a taxa de análise (Safari antigo recusa 16 kHz; aí usa 32 kHz). */
async function paraMono(buf: AudioBuffer): Promise<{ amostras: Float32Array; taxa: number }> {
  for (const taxa of [TAXA_ANALISE, 32_000]) {
    try {
      const off = new OfflineAudioContext(1, Math.ceil(buf.duration * taxa), taxa);
      const fonte = off.createBufferSource();
      fonte.buffer = buf;
      fonte.connect(off.destination);
      fonte.start();
      const r = await off.startRendering();
      return { amostras: r.getChannelData(0).slice(), taxa };
    } catch {
      // tenta a próxima taxa
    }
  }
  return { amostras: buf.getChannelData(0).slice(), taxa: buf.sampleRate };
}

function extrairNoWorker(pedido: Pedido, progresso: (f: number) => void): Promise<{ notas: NotaPiano[]; afinacaoCents: number }> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./analisador.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<Resposta>) => {
      if (e.data.tipo === 'progresso') progresso(e.data.fracao);
      else {
        resolve({ notas: e.data.notas, afinacaoCents: e.data.afinacaoCents });
        w.terminate();
      }
    };
    w.onerror = (e) => {
      reject(new Error(e.message));
      w.terminate();
    };
    w.postMessage(pedido, [pedido.amostras.buffer]);
  });
}

/** Um exercício gravado: toca o áudio e guarda a voz cantada no tempo dele. */
export class Exercicio {
  readonly voz: PontoVoz[] = [];
  tocando = false;
  private fonte?: AudioBufferSourceNode;
  private inicioCtx = 0;
  private pausadoEm = 0;

  private constructor(
    readonly nome: string,
    private buffer: AudioBuffer,
    readonly notas: NotaPiano[],
    /** Afinação do piano gravado em relação ao Lá de referência, em cents. */
    readonly afinacaoCents: number,
    /** Exercício da biblioteca de onde veio, para guardar o resultado da prática. */
    readonly idBiblioteca: string | null,
  ) {}

  static async carregar(
    audioArquivo: Blob,
    nome: string,
    a4: number,
    progresso: (fase: string, fracao: number) => void,
    idBiblioteca: string | null = null,
  ): Promise<Exercicio> {
    progresso('Lendo o arquivo', 0);
    let buf: AudioBuffer;
    try {
      buf = await audio().decodeAudioData(await audioArquivo.arrayBuffer());
    } catch {
      throw new Error('Não consegui ler esse arquivo de áudio. Use MP3, M4A, WAV ou OGG.');
    }
    const { amostras, taxa } = await paraMono(buf);
    const { notas, afinacaoCents } = await extrairNoWorker({ amostras, taxa, a4 }, (f) => progresso('Encontrando as notas do piano', f));
    if (!notas.length) throw new Error('Não encontrei notas de piano nesse áudio. A análise funciona com piano tocando uma nota por vez.');
    return new Exercicio(nome, buf, notas, afinacaoCents, idBiblioteca);
  }

  /** Altura real da nota do piano (MIDI fracionário), com oitava de comparação e afinação da gravação. */
  alturaPiano(n: NotaPiano, deslocamento: number): number {
    return n.midi + deslocamento + this.afinacaoCents / 100;
  }

  get duracao() {
    return this.buffer.duration;
  }

  get posicao(): number {
    if (!this.tocando) return this.pausadoEm;
    return Math.min(this.duracao, audio().currentTime - this.inicioCtx);
  }

  tocar() {
    if (this.tocando) return;
    if (this.pausadoEm >= this.duracao - 0.05) this.irPara(0);
    const ctx = audio();
    const fonte = ctx.createBufferSource();
    fonte.buffer = this.buffer;
    fonte.connect(ctx.destination);
    fonte.onended = () => {
      if (this.fonte !== fonte) return;
      this.pausadoEm = this.duracao;
      this.tocando = false;
      this.fonte = undefined;
    };
    fonte.start(0, this.pausadoEm);
    this.inicioCtx = ctx.currentTime - this.pausadoEm;
    this.fonte = fonte;
    this.tocando = true;
  }

  pausar() {
    if (!this.tocando) return;
    this.pausadoEm = this.posicao;
    this.pararFonte();
    this.tocando = false;
  }

  /** Vai para um ponto do exercício e apaga a voz gravada dali em diante. */
  irPara(t: number) {
    const tocava = this.tocando;
    if (tocava) this.pausar();
    this.pausadoEm = Math.max(0, Math.min(this.duracao, t));
    while (this.voz.length && this.voz[this.voz.length - 1].t >= this.pausadoEm) this.voz.pop();
    if (tocava) this.tocar();
  }

  descartar() {
    this.pararFonte();
    this.tocando = false;
  }

  /** `atraso` em segundos: quanto o som leva do alto-falante até a análise do microfone. */
  registrar(midi: number | null, atraso: number) {
    if (!this.tocando || midi == null) return;
    const t = this.posicao - atraso;
    if (t < 0) return;
    const ultimo = this.voz[this.voz.length - 1];
    if (ultimo && t <= ultimo.t) return;
    this.voz.push({ t, midi });
  }

  /** Nota do piano soando no instante `t`, já com o deslocamento de oitava. */
  notaEm(t: number, deslocamento: number): number | null {
    let lo = 0;
    let hi = this.notas.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      const n = this.notas[m];
      if (t < n.inicio) hi = m - 1;
      else if (t >= n.fim) lo = m + 1;
      else return this.alturaPiano(n, deslocamento);
    }
    return null;
  }

  /** Compara cada nota do piano já tocada com a mediana da voz durante ela. */
  avaliar(deslocamento: number): Avaliacao {
    let avaliadas = 0;
    let acertos = 0;
    let somaDesvio = 0;
    let j = 0;
    for (const n of this.notas) {
      const ini = n.inicio + Math.min(REACAO_S, (n.fim - n.inicio) / 2);
      while (j < this.voz.length && this.voz[j].t < ini) j++;
      const trecho: number[] = [];
      for (let k = j; k < this.voz.length && this.voz[k].t < n.fim; k++) trecho.push(this.voz[k].midi);
      if (trecho.length < 3) continue;
      trecho.sort((a, b) => a - b);
      const desvio = Math.abs(trecho[trecho.length >> 1] - this.alturaPiano(n, deslocamento)) * 100;
      avaliadas++;
      somaDesvio += Math.min(desvio, 100);
      if (desvio <= TOLERANCIA_ACERTO) acertos++;
    }
    return { avaliadas, acertos, desvioMedio: avaliadas ? somaDesvio / avaliadas : null };
  }

  private pararFonte() {
    const f = this.fonte;
    this.fonte = undefined;
    try {
      f?.stop();
    } catch {
      // já tinha parado
    }
    f?.disconnect();
  }
}
