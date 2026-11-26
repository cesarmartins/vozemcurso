import './style.css';
import { Analise, type Ajustes } from './analise/Analise';
import { ErroMicrofone, Microfone } from './audio/Microfone';
import { tocarNota } from './audio/referencia';
import { Exercicio } from './exercicio/Exercicio';
import { salvarResultado } from './exercicios/resultados';
import { cifra, nomeNota } from './musica/notas';
import { GraficoExercicio } from './ui/graficoExercicio';
import { iniciarBiblioteca } from './ui/biblioteca';
import { iniciarPortal } from './ui/portal';
import { desenharVolume, GraficoMelodia, Tela } from './ui/graficos';
import { el, mostrarExtensao, PainelAfinador, PainelVolume } from './ui/paineis';
import { lerCores } from './ui/tema';

const ajustes: Ajustes = { a4: 440, limiarDb: -50 };
let alvo: number | null = 60;
let cores = lerCores();
let wakeLock: WakeLockSentinel | null = null;

const mic = new Microfone();
const analise = new Analise();
const afinador = new PainelAfinador();
const volume = new PainelVolume();

const nada = () => {};
const telaVolume = new Tela(el<HTMLCanvasElement>('volCanvas'), nada);
const telaMelodia = new Tela(el<HTMLCanvasElement>('pitchCanvas'), nada);
const melodia = new GraficoMelodia(telaMelodia);
const graficoEx = new GraficoExercicio(telaMelodia);

// Exercício gravado
let exercicio: Exercicio | null = null;
let deslocamento = 0;
let atrasoManual = 0;
let ultimaAvaliacao = 0;
let estavaTocando = false;
/** Quantos pontos de voz já foram salvos como prática, para não salvar a mesma tentativa duas vezes. */
let vozJaSalva = 0;
/** Cada carregamento ganha um número; um carregamento antigo que termine depois é descartado. */
let carregamentoAtual = 0;
const MIN_NOTAS_PARA_SALVAR = 5;

// Um laço só: lê o microfone (se ligado) e redesenha tudo a cada quadro.
function quadro() {
  const agora = performance.now();
  if (mic.ligado) {
    if (analise.processar(mic.ler(), mic.taxa, agora, ajustes)) mostrarExtensao(analise);
    afinador.atualizar(analise.midi, ajustes.a4, agora, cores);
    volume.atualizar(analise, cores);
    exercicio?.registrar(analise.midi, mic.atraso + atrasoManual);
  }
  if (exercicio) {
    // Terminou sozinho: guarda o resultado.
    if (estavaTocando && !exercicio.tocando && exercicio.posicao >= exercicio.duracao - 0.05) concluirTentativa();
    estavaTocando = exercicio.tocando;
    graficoEx.desenhar(exercicio, cores, deslocamento);
    atualizarControlesEx(exercicio, agora);
  } else {
    melodia.desenhar(analise.historico, agora, cores, alvo, mic.ligado);
  }
  desenharVolume(telaVolume, analise.historico, agora, cores);
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

// Microfone
const botao = el<HTMLButtonElement>('startBtn');
const rotulo = el('startLbl');
const erro = el('err');
const seletorMic = el<HTMLSelectElement>('micSel');

async function ligar(): Promise<boolean> {
  erro.hidden = true;
  try {
    await mic.ligar(seletorMic.value || undefined);
  } catch (e) {
    erro.textContent = e instanceof ErroMicrofone ? e.message : 'Não foi possível abrir o microfone.';
    erro.hidden = false;
    return false;
  }
  botao.classList.add('live');
  rotulo.textContent = 'Desligar microfone';
  void listarMicrofones();
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }
  return true;
}

function desligar() {
  mic.desligar();
  botao.classList.remove('live');
  rotulo.textContent = 'Ligar microfone';
  void wakeLock?.release().catch(nada);
  wakeLock = null;
}

async function listarMicrofones() {
  const atual = seletorMic.value;
  seletorMic.length = 1;
  (await Microfone.listar()).forEach((d, i) => seletorMic.add(new Option(d.label || `Microfone ${i + 1}`, d.deviceId)));
  seletorMic.value = atual;
}

botao.addEventListener('click', () => (mic.ligado ? desligar() : void ligar()));
seletorMic.addEventListener('change', () => {
  if (mic.ligado) {
    desligar();
    void ligar();
  }
});

// Nota de referência (Dó2 a Dó6)
const seletorRef = el<HTMLSelectElement>('refSel');
seletorRef.add(new Option('Nenhuma', ''));
for (let n = 36; n <= 84; n++) seletorRef.add(new Option(`${nomeNota(n)}  ·  ${cifra(n)}`, String(n)));
seletorRef.value = String(alvo);
seletorRef.addEventListener('change', () => {
  alvo = seletorRef.value === '' ? null : Number(seletorRef.value);
});
el('playBtn').addEventListener('click', () => {
  if (alvo != null) tocarNota(alvo, ajustes.a4);
});

// Ajustes
el<HTMLInputElement>('gate').addEventListener('input', (e) => {
  ajustes.limiarDb = Number((e.target as HTMLInputElement).value);
  el('gateVal').textContent = String(ajustes.limiarDb).replace('-', '−');
});
el<HTMLInputElement>('a4').addEventListener('change', (e) => {
  const campo = e.target as HTMLInputElement;
  const v = Number(campo.value);
  if (v >= 400 && v <= 480) ajustes.a4 = v;
  else campo.value = String(ajustes.a4);
});
el('resetBtn').addEventListener('click', () => {
  analise.zerarSessao();
  mostrarExtensao(analise);
  volume.atualizar(analise, cores);
});

// Exercício: interface
const cartao = el('graphCard');
const titulo = el('graphTitle');
const dicaGrafico = el('graphHint');
const arquivo = el<HTMLInputElement>('exFile');
const botaoArquivo = el('exFileBtn');
const rotuloArquivo = el('exFileLbl');
const status = el('exStatus');
const controles = el('exCtl');
const rodape = el('exFoot');
const tocar = el<HTMLButtonElement>('exPlay');
const barraPosicao = el<HTMLInputElement>('exSeek');
const tempo = el('exTime');
const textoInicial = { titulo: titulo.textContent ?? '', dica: dicaGrafico.textContent ?? '', status: status.textContent ?? '' };

const placar = el('exScore');
const desvio = el('exDev');
const salvo = el('exSaved');

const semExtensao = (arquivo: string) => arquivo.replace(/\.(mp3|m4a|wav|ogg|aac|flac|webm)$/i, '');
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let arrastandoPosicao = false;

/** Troca o texto só quando muda: este código roda 60 vezes por segundo. */
function texto(e: HTMLElement, valor: string) {
  if (e.textContent !== valor) e.textContent = valor;
}

function atualizarControlesEx(ex: Exercicio, agora: number) {
  texto(tocar, ex.tocando ? '❚❚ Pausar' : '▶ Tocar e cantar');
  if (!arrastandoPosicao) barraPosicao.value = String(Math.round((ex.posicao / ex.duracao) * 1000));
  texto(tempo, `${mmss(ex.posicao)} / ${mmss(ex.duracao)}`);
  if (agora - ultimaAvaliacao > 400) {
    ultimaAvaliacao = agora;
    const a = ex.avaliar(deslocamento);
    texto(placar, a.avaliadas ? `${a.acertos} de ${a.avaliadas}` : '—');
    texto(desvio, a.desvioMedio == null ? '—' : `${Math.round(a.desvioMedio)} cents`);
  }
}

/** Salva a tentativa atual no histórico do exercício, se houve canto suficiente. */
function concluirTentativa() {
  const ex = exercicio;
  const contaId = portal.conta()?.id;
  if (!ex?.idBiblioteca || !contaId || ex.voz.length <= vozJaSalva) return;
  const a = ex.avaliar(deslocamento);
  if (a.avaliadas < MIN_NOTAS_PARA_SALVAR || a.desvioMedio == null) return;
  vozJaSalva = ex.voz.length;
  const ok = salvarResultado(contaId, ex.idBiblioteca, { data: Date.now(), acertos: a.acertos, avaliadas: a.avaliadas, desvioMedio: a.desvioMedio });
  salvo.textContent = ok ? `Prática salva: ${a.acertos} de ${a.avaliadas} notas certas.` : 'Não consegui salvar a prática neste navegador.';
  salvo.hidden = false;
  biblioteca.atualizar();
}

async function carregar(audioArquivo: Blob, nome: string, idBiblioteca: string | null = null) {
  concluirTentativa();
  fecharExercicio();
  const meu = ++carregamentoAtual;
  botaoArquivo.classList.add('disabled');
  erro.hidden = true;
  try {
    const ex = await Exercicio.carregar(audioArquivo, nome, ajustes.a4, (fase, fracao) => {
      if (meu === carregamentoAtual) status.textContent = `${fase}… ${Math.round(fracao * 100)}%`;
    }, idBiblioteca);
    if (meu !== carregamentoAtual) return;
    exercicio = ex;
    vozJaSalva = 0;
    estavaTocando = false;
    salvo.hidden = true;
    titulo.textContent = `Exercício · ${ex.nome}`;
    dicaGrafico.textContent = `${ex.notas.length} notas do piano`;
    status.textContent = '';
    status.hidden = true;
    controles.hidden = false;
    rodape.hidden = false;
    rotuloArquivo.textContent = 'Trocar exercício';
  } catch (e) {
    if (meu !== carregamentoAtual) return;
    status.textContent = textoInicial.status;
    erro.textContent = e instanceof Error ? e.message : 'Não consegui abrir esse exercício.';
    erro.hidden = false;
  } finally {
    if (meu === carregamentoAtual) botaoArquivo.classList.remove('disabled');
  }
}

function fecharExercicio() {
  concluirTentativa();
  exercicio?.descartar();
  exercicio = null;
  titulo.textContent = textoInicial.titulo;
  dicaGrafico.textContent = textoInicial.dica;
  status.textContent = textoInicial.status;
  status.hidden = false;
  controles.hidden = true;
  rodape.hidden = true;
  salvo.hidden = true;
  rotuloArquivo.textContent = 'Carregar exercício';
}

arquivo.addEventListener('change', () => {
  const f = arquivo.files?.[0];
  arquivo.value = '';
  if (f) void carregar(f, semExtensao(f.name));
});
cartao.addEventListener('dragover', (e) => {
  e.preventDefault();
  cartao.classList.add('drop');
});
cartao.addEventListener('dragleave', () => cartao.classList.remove('drop'));
cartao.addEventListener('drop', (e) => {
  e.preventDefault();
  cartao.classList.remove('drop');
  const f = e.dataTransfer?.files[0];
  if (f) void carregar(f, semExtensao(f.name));
});

tocar.addEventListener('click', async () => {
  const ex = exercicio;
  if (!ex) return;
  if (ex.tocando) return ex.pausar();
  // Sem microfone o exercício toca mesmo assim, só com o piano.
  if (!mic.ligado) await ligar();
  ex.tocar();
});
el('exRestart').addEventListener('click', () => {
  concluirTentativa();
  vozJaSalva = 0;
  exercicio?.irPara(0);
});
el('exClose').addEventListener('click', fecharExercicio);
barraPosicao.addEventListener('input', () => {
  arrastandoPosicao = true;
});
barraPosicao.addEventListener('change', () => {
  arrastandoPosicao = false;
  if (exercicio) exercicio.irPara((Number(barraPosicao.value) / 1000) * exercicio.duracao);
});
el<HTMLSelectElement>('exOct').addEventListener('change', (e) => {
  deslocamento = Number((e.target as HTMLSelectElement).value);
  ultimaAvaliacao = 0;
});
el<HTMLInputElement>('exLag').addEventListener('input', (e) => {
  const ms = Number((e.target as HTMLInputElement).value);
  atrasoManual = ms / 1000;
  el('exLagVal').textContent = String(ms);
});

// Biblioteca e portal
const biblioteca = iniciarBiblioteca({
  aoPraticar: async ({ id, nome, obterAudio }) => {
    portal.irPara('afinador');
    requestAnimationFrame(() => cartao.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    status.textContent = 'Abrindo o exercício…';
    let blob: Blob;
    try {
      blob = await obterAudio();
    } catch (e) {
      erro.textContent = e instanceof Error ? e.message : 'Não consegui abrir esse exercício.';
      erro.hidden = false;
      status.textContent = textoInicial.status;
      return;
    }
    await carregar(blob, nome, id);
  },
  irParaBiblioteca: () => portal.irPara('biblioteca'),
});
const portal = iniciarPortal({
  aoMudarContexto: (contexto) => biblioteca.definirContexto(contexto),
  aoSairDoAfinador: () => {
    fecharExercicio();
    if (mic.ligado) desligar();
  },
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  cores = lerCores();
});
