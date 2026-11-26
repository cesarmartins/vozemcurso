import type { Analise } from '../analise/Analise';
import { centsDe, cifra, midiParaFreq, nome, nomeNota, oitava } from '../musica/notas';
import { faixaCents, type Cores } from './tema';

export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Elemento #${id} não encontrado`);
  return e as T;
}

const formatarDb = (v: number) => (v < -90 ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
const MANTER_NOTA_MS = 700;

export class PainelAfinador {
  private caixa = el('tuner');
  private chip = el('tuneChip');
  private nota = el('note');
  private hz = el('hz');
  private letra = el('letter');
  private centsTxt = el('centsTxt');
  private agulha = el('needle');
  private cents = 0;
  private ultimaNotaEm = 0;

  atualizar(midi: number | null, a4: number, agora: number, cores: Cores) {
    if (midi != null) {
      this.ultimaNotaEm = agora;
      const n = Math.round(midi);
      this.cents += (centsDe(midi) - this.cents) * 0.35;
      this.caixa.classList.remove('idle');
      this.nota.innerHTML = `${nome(n)}<sub>${oitava(n)}</sub>`;
      this.hz.textContent = midiParaFreq(midi, a4).toFixed(1) + ' Hz';
      this.letra.textContent = cifra(n);
      const ci = Math.round(this.cents);
      this.centsTxt.textContent = (ci > 0 ? '+' : ci < 0 ? '−' : '± ') + Math.abs(ci) + ' cents';
      const faixa = faixaCents(this.cents);
      const alto = this.cents > 0;
      this.chip.className = 'chip ' + faixa;
      this.chip.textContent =
        faixa === 'good' ? 'Afinado' : faixa === 'warn' ? (alto ? 'Um pouco alto' : 'Um pouco baixo') : alto ? 'Alto demais' : 'Baixo demais';
      this.agulha.style.left = 50 + Math.max(-50, Math.min(50, this.cents)) + '%';
      this.agulha.style.background = cores[faixa];
    } else if (agora - this.ultimaNotaEm > MANTER_NOTA_MS) {
      this.caixa.classList.add('idle');
      this.chip.className = 'chip';
      this.chip.textContent = 'Cante uma nota';
      this.agulha.style.background = cores.fg;
    }
  }
}

function zonaVolume(db: number): [string, '' | 'good' | 'warn' | 'bad'] {
  if (db < -50) return ['Silêncio', ''];
  if (db < -40) return ['Muito baixo', 'warn'];
  if (db < -15) return ['Bom', 'good'];
  if (db < -5) return ['Forte', 'warn'];
  return ['Saturando', 'bad'];
}

const pct = (db: number) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));

export class PainelVolume {
  private valor = el('dbVal');
  private barra = el('vfill');
  private marcaPico = el('vpeak');
  private chip = el('volChip');
  private sPico = el('sPeak');
  private sMedia = el('sAvg');
  private sMax = el('sMax');

  atualizar(a: Analise, cores: Cores) {
    const d = a.dbSuave;
    this.valor.textContent = d < -90 ? '−∞' : formatarDb(d);
    this.barra.style.width = pct(d) + '%';
    const [texto, classe] = zonaVolume(d);
    this.barra.style.background = classe ? cores[classe] : cores.muted;
    this.chip.className = 'chip ' + classe;
    this.chip.textContent = texto;
    this.marcaPico.style.left = `calc(${pct(a.pico)}% - 3px)`;
    this.sPico.textContent = formatarDb(a.pico);
    this.sMax.textContent = formatarDb(a.maximo);
    const media = a.media;
    this.sMedia.textContent = media == null ? '—' : formatarDb(media);
  }
}

export function mostrarExtensao(a: Analise) {
  const saida = el('rangeOut');
  const dica = el('rangeHint');
  if (a.grave == null || a.aguda == null) {
    saida.textContent = '—';
    return;
  }
  const semitons = a.aguda - a.grave;
  saida.textContent = `${nomeNota(a.grave)} – ${nomeNota(a.aguda)}`;
  dica.textContent = `${semitons} semitons (${(semitons / 12).toFixed(1).replace('.', ',')} oitavas) · ${cifra(a.grave)} a ${cifra(a.aguda)}`;
}
