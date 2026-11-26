import { JANELA_MS, type Ponto } from '../analise/Analise';
import { centsDe, ehDo, ehNatural, mod, nomeNota } from '../musica/notas';
import { faixaCents, type Cores } from './tema';

export class Tela {
  readonly g: CanvasRenderingContext2D;
  w = 0;
  h = 0;

  constructor(readonly el: HTMLCanvasElement, aoRedimensionar: () => void) {
    const g = el.getContext('2d');
    if (!g) throw new Error('Canvas 2D indisponível');
    this.g = g;
    new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const d = devicePixelRatio || 1;
      this.w = r.width;
      this.h = r.height;
      el.width = r.width * d;
      el.height = r.height * d;
      g.setTransform(d, 0, 0, d, 0, 0);
      aoRedimensionar();
    }).observe(el);
  }
}

const corCents = (midi: number, c: Cores) => c[faixaCents(centsDe(midi))];

/** Margem esquerda dos gráficos de notas, onde ficam os nomes. */
export const ESQ = 56;

export const escalaY = (h: number, lo: number, hi: number) => (m: number) => h - ((m - lo) / (hi - lo)) * h;

/** Linhas de cada semitom; Dó mais forte, nomes só nas notas naturais. */
export function desenharGrade(tela: Tela, lo: number, hi: number, cores: Cores) {
  const { g, w, h } = tela;
  const y = escalaY(h, lo, hi);
  g.font = '11px "JetBrains Mono", monospace';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  // Mi/Fá e Si/Dó ficam a um semitom: com pouco espaço, os nomes de Fá e Si se sobrepõem aos vizinhos.
  const apertado = h / (hi - lo) < 18;
  for (let n = Math.ceil(lo); n <= Math.floor(hi); n++) {
    const yy = Math.round(y(n)) + 0.5;
    const nat = ehNatural(n);
    const comNome = nat && !(apertado && (mod(n, 12) === 5 || mod(n, 12) === 11));
    g.strokeStyle = cores.line;
    g.globalAlpha = ehDo(n) ? 1 : nat ? 0.75 : 0.3;
    g.lineWidth = ehDo(n) ? 1.5 : 1;
    g.beginPath();
    g.moveTo(ESQ, yy);
    g.lineTo(w - 8, yy);
    g.stroke();
    g.globalAlpha = 1;
    if (comNome) {
      g.fillStyle = ehDo(n) ? cores.fg : cores.muted;
      g.fillText(nomeNota(n), 8, yy);
    }
  }
}

/** Gráfico da linha melódica com as notas no eixo vertical, centrado na voz. */
export class GraficoMelodia {
  private centro: number | null = null;

  constructor(private tela: Tela) {}

  desenhar(hist: Ponto[], agora: number, cores: Cores, alvo: number | null, ligado: boolean) {
    const { g, w, h } = this.tela;
    if (!w) return;
    g.clearRect(0, 0, w, h);

    const cantadas = hist.flatMap((p) => (p.midi == null ? [] : [p.midi])).slice(-90).sort((a, b) => a - b);
    const desejado = cantadas.length ? cantadas[cantadas.length >> 1] : (alvo ?? 60);
    this.centro = this.centro == null || !ligado ? desejado : this.centro + (desejado - this.centro) * 0.04;

    const faixa = h < 260 ? 12 : 16;
    const lo = this.centro - faixa / 2;
    const hi = this.centro + faixa / 2;
    const y = escalaY(h, lo, hi);
    const esq = ESQ;
    const largura = w - esq - 8;
    desenharGrade(this.tela, lo, hi, cores);

    if (alvo != null && alvo > lo && alvo < hi) {
      const yy = y(alvo);
      g.strokeStyle = cores.accent;
      g.lineWidth = 2;
      g.setLineDash([6, 5]);
      g.beginPath();
      g.moveTo(esq, yy);
      g.lineTo(w - 8, yy);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = cores.accent;
      g.textAlign = 'right';
      g.fillText('alvo ' + nomeNota(alvo), w - 12, yy - 10);
      g.textAlign = 'left';
    }

    if (!hist.length) {
      g.fillStyle = cores.muted;
      g.font = '14px Inter, system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(ligado ? 'Cante para ver sua linha melódica' : 'Ligue o microfone e cante para ver sua linha melódica', esq + largura / 2, h / 2);
      g.textAlign = 'left';
      return;
    }

    const x = (t: number) => esq + ((t - (agora - JANELA_MS)) / JANELA_MS) * largura;
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 1; i < hist.length; i++) {
      const a = hist[i - 1].midi;
      const b = hist[i].midi;
      if (a == null || b == null || Math.abs(a - b) > 1.5) continue;
      g.strokeStyle = corCents(b, cores);
      g.beginPath();
      g.moveTo(x(hist[i - 1].t), y(a));
      g.lineTo(x(hist[i].t), y(b));
      g.stroke();
    }
    const ultimo = hist[hist.length - 1];
    if (ultimo.midi != null) {
      g.fillStyle = corCents(ultimo.midi, cores);
      g.beginPath();
      g.arc(x(ultimo.t), y(ultimo.midi), 5, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Histórico de volume de −60 a 0 dB. */
export function desenharVolume(tela: Tela, hist: Ponto[], agora: number, cores: Cores) {
  const { g, w, h } = tela;
  if (!w) return;
  g.clearRect(0, 0, w, h);
  const y = (db: number) => h - Math.max(0, Math.min(1, (db + 60) / 60)) * h;
  g.strokeStyle = cores.line;
  g.lineWidth = 1;
  for (const d of [-40, -15, -5]) {
    const yy = Math.round(y(d)) + 0.5;
    g.beginPath();
    g.moveTo(0, yy);
    g.lineTo(w, yy);
    g.stroke();
  }
  if (hist.length < 2) return;
  const x = (t: number) => ((t - (agora - JANELA_MS)) / JANELA_MS) * w;
  g.beginPath();
  g.moveTo(x(hist[0].t), h);
  for (const p of hist) g.lineTo(x(p.t), y(p.db));
  g.lineTo(x(hist[hist.length - 1].t), h);
  g.closePath();
  g.fillStyle = cores.accent;
  g.globalAlpha = 0.25;
  g.fill();
  g.globalAlpha = 1;
  g.beginPath();
  hist.forEach((p, i) => (i ? g.lineTo(x(p.t), y(p.db)) : g.moveTo(x(p.t), y(p.db))));
  g.strokeStyle = cores.accent;
  g.lineWidth = 1.5;
  g.stroke();
}
