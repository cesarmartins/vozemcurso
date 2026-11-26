import { TOLERANCIA_ACERTO, type Exercicio } from '../exercicio/Exercicio';
import { nomeNota } from '../musica/notas';
import { planejarFaixas, type Faixa } from './faixaVertical';
import { desenharGrade, ESQ, escalaY, type Tela } from './graficos';
import type { Cores } from './tema';

// Janela que acompanha a música: 6 s do que passou e 4 s do que vem, como num karaokê.
const ANTES = 6;
const DEPOIS = 4;
/** Duração da transição quando a faixa de notas muda. */
const TRANSICAO_MS = 500;

/** Cor da voz comparada à nota do piano que soa no mesmo instante. */
function corVoz(voz: number, piano: number | null, c: Cores): string {
  if (piano == null) return c.muted;
  const d = Math.abs(voz - piano) * 100;
  return d <= TOLERANCIA_ACERTO / 2 ? c.good : d <= TOLERANCIA_ACERTO ? c.warn : c.bad;
}

function barra(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h / 2, w / 2);
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

const suavizar = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

export class GraficoExercicio {
  /** Plano de faixas do exercício atual; refeito quando muda o exercício ou a oitava de comparação. */
  private plano: { ex: Exercicio; deslocamento: number; faixaEm: (t: number) => Faixa } | null = null;
  private mostrada: Faixa | null = null;
  private transicao: { de: Faixa; para: Faixa; inicio: number } | null = null;

  constructor(private tela: Tela) {}

  /** Faixa vertical do instante atual: parada, e com transição suave quando muda de frase. */
  private faixa(ex: Exercicio, deslocamento: number, pos: number): Faixa {
    if (!this.plano || this.plano.ex !== ex || this.plano.deslocamento !== deslocamento) {
      const notas = ex.notas.map((n) => ({ inicio: n.inicio, fim: n.fim, altura: ex.alturaPiano(n, deslocamento) }));
      this.plano = { ex, deslocamento, faixaEm: planejarFaixas(notas) };
      this.mostrada = null;
      this.transicao = null;
    }
    const alvo = this.plano.faixaEm(pos);
    const agora = performance.now();
    // Parado ou recém-aberto: vai direto para a faixa certa.
    if (!this.mostrada || !ex.tocando) {
      this.transicao = null;
      this.mostrada = alvo;
      return alvo;
    }
    if (this.transicao?.para !== alvo && this.mostrada !== alvo) {
      this.transicao = { de: this.mostrada, para: alvo, inicio: agora };
    }
    if (this.transicao) {
      const k = Math.min(1, (agora - this.transicao.inicio) / TRANSICAO_MS);
      const e = suavizar(k);
      const { de, para } = this.transicao;
      this.mostrada = k >= 1 ? para : { lo: de.lo + (para.lo - de.lo) * e, hi: de.hi + (para.hi - de.hi) * e };
      if (k >= 1) this.transicao = null;
    }
    return this.mostrada;
  }

  desenhar(ex: Exercicio, cores: Cores, deslocamento: number) {
    const { g, w, h } = this.tela;
    if (!w) return;
    g.clearRect(0, 0, w, h);
    const pos = ex.posicao;
    const t0 = pos - ANTES;
    const t1 = pos + DEPOIS;
    const { lo, hi } = this.faixa(ex, deslocamento, pos);
    const y = escalaY(h, lo, hi);
    const alturaNota = h / (hi - lo);
    const largura = w - ESQ - 8;
    const x = (t: number) => ESQ + ((t - t0) / (ANTES + DEPOIS)) * largura;

    desenharGrade(this.tela, lo, hi, cores);

    g.save();
    g.beginPath();
    g.rect(ESQ, 0, largura, h);
    g.clip();

    // Notas do piano
    g.font = '600 11px Inter, system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const n of ex.notas) {
      if (n.fim < t0 || n.inicio > t1) continue;
      const m = ex.alturaPiano(n, deslocamento);
      const xa = x(n.inicio);
      const xb = x(n.fim);
      const soando = pos >= n.inicio && pos < n.fim;
      g.fillStyle = cores.accent;
      g.globalAlpha = soando ? 0.75 : n.fim < pos ? 0.3 : 0.45;
      barra(g, xa, y(m) - alturaNota * 0.4, Math.max(2, xb - xa - 1), alturaNota * 0.8);
      if (xb - xa > 34 && alturaNota > 12) {
        g.globalAlpha = 1;
        g.fillStyle = cores.fg;
        g.fillText(nomeNota(n.midi + deslocamento), xa + 5, y(m));
      }
    }
    g.globalAlpha = 1;

    // Voz: média de 3 pontos só no desenho, para a linha não tremer (a avaliação usa os valores reais).
    const voz = ex.voz;
    const continua = (i: number, j: number) =>
      j >= 0 && j < voz.length && Math.abs(voz[j].t - voz[i].t) <= 0.08 * Math.abs(j - i) && Math.abs(voz[j].midi - voz[i].midi) <= 1.5;
    const alturaVoz = (i: number) => {
      let soma = voz[i].midi;
      let n = 1;
      for (const j of [i - 1, i + 1]) {
        if (continua(i, j)) {
          soma += voz[j].midi;
          n++;
        }
      }
      return soma / n;
    };
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 1; i < voz.length; i++) {
      if (voz[i].t < t0) continue;
      if (!continua(i, i - 1)) continue;
      g.strokeStyle = corVoz(voz[i].midi, ex.notaEm(voz[i].t, deslocamento), cores);
      g.beginPath();
      g.moveTo(x(voz[i - 1].t), y(alturaVoz(i - 1)));
      g.lineTo(x(voz[i].t), y(alturaVoz(i)));
      g.stroke();
    }

    // Voz fora da faixa: seta na borda em vez de mexer no gráfico.
    const ultima = voz[voz.length - 1];
    if (ultima && ex.tocando && pos - ultima.t < 0.4 && (ultima.midi < lo || ultima.midi > hi)) {
      const acima = ultima.midi > hi;
      const xs = x(ultima.t);
      const ys = acima ? 8 : h - 8;
      g.fillStyle = cores.bad;
      g.beginPath();
      g.moveTo(xs, acima ? ys - 6 : ys + 6);
      g.lineTo(xs - 7, acima ? ys + 6 : ys - 6);
      g.lineTo(xs + 7, acima ? ys + 6 : ys - 6);
      g.closePath();
      g.fill();
      g.font = '600 11px Inter, system-ui, sans-serif';
      g.textAlign = 'right';
      g.fillText(acima ? 'voz acima' : 'voz abaixo', xs - 12, acima ? ys + 2 : ys - 2);
      g.textAlign = 'left';
    }

    // Cursor do tempo atual
    const xc = Math.round(x(pos)) + 0.5;
    g.strokeStyle = cores.fg;
    g.globalAlpha = 0.5;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(xc, 0);
    g.lineTo(xc, h);
    g.stroke();
    g.globalAlpha = 1;
    g.restore();
  }
}
