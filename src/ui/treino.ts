import { audio } from '../audio/contexto';
import type { Conta } from '../contas';
import { listarExercicios } from '../exercicios/biblioteca';
import { CATEGORIAS } from '../exercicios/catalogo';
import { duracaoDe, EXERCICIOS_PADRAO, idPratica, type ExercicioPadrao, type ExercicioVocalise } from '../treino/padroes';
import {
  concluirDia,
  dataLocal,
  duracaoPasso,
  lerProgresso,
  marcar,
  montarRotina,
  naSemana,
  NOMES_BLOCO,
  reiniciarDia,
  sequencia,
  type ExercicioEnviado,
  type Passo,
} from '../treino/rotina';
import { gerarVocalise, notasDoVocalise, tonicaPara } from '../treino/vocalise';
import type { ContextoBiblioteca, ExercicioParaPraticar } from './biblioteca';

// Tela "Treino": a rotina do dia (estilo academia) e o player passo a passo com cronômetro.

export interface OpcoesTreino {
  conta: () => Conta | null;
  praticar: (ex: ExercicioParaPraticar) => void;
  a4: () => number;
}

export interface ControleTreino {
  definirContexto(contexto: ContextoBiblioteca): void;
  /** Recarrega os exercícios enviados pelo professor (ex.: depois de marcar um na biblioteca). */
  atualizar(): void;
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Elemento #${id} não encontrado`);
  return e as T;
}

function criar<T extends keyof HTMLElementTagNameMap>(tag: T, classe?: string, texto?: string): HTMLElementTagNameMap[T] {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto) no.textContent = texto;
  return no;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s % 60))).padStart(2, '0')}`;
const minutos = (s: number) => (s < 45 ? `${Math.round(s)} s` : `${Math.max(1, Math.round(s / 60))} min`);
const nomeCategoria = new Map(CATEGORIAS.map((c) => [c.id as string, c.nome] as const));
const ICONE: Record<string, string> = { feito: '✓', pulado: '–' };

/** Dois bipes curtos e uma vibração, para avisar que o tempo acabou. */
function avisarFim() {
  try {
    const ctx = audio();
    for (const [i, f] of [880, 1175].entries()) {
      const t = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  } catch {
    // sem áudio: só a vibração
  }
  navigator.vibrate?.([120, 80, 120]);
}

export function iniciarTreino(opcoes: OpcoesTreino): ControleTreino {
  const lista = el('treinoLista');
  const stats = el('treinoStats');
  const player = el('treinoPlayer');
  const botaoComecar = el<HTMLButtonElement>('treinoComecar');
  const padroes = el('padroesLista');

  let contexto: ContextoBiblioteca | null = null;
  let enviados: ExercicioEnviado[] = [];
  let passos: Passo[] = montarRotina([]);
  let atual = -1;
  let versao = 0;

  // Cronômetro do passo aberto.
  let restante = 0;
  let total = 0;
  let rodando = false;
  let ultimoTique = 0;
  let quadro = 0;
  let wake: WakeLockSentinel | null = null;

  const hoje = () => dataLocal(new Date());
  /** Para quem estuda sozinho, o bloco "do professor" é o dos próprios exercícios. */
  const sozinho = () => contexto?.papel === 'aluno-independente';
  const nomeBloco = (b: Passo['bloco']) => (b === 'professor' && sozinho() ? 'Seus exercícios' : NOMES_BLOCO[b]);
  const contaId = () => opcoes.conta()?.id ?? '';
  const estados = () => lerProgresso(contaId()).dias[hoje()] ?? {};

  async function carregarEnviados() {
    const minha = ++versao;
    let lidos: ExercicioEnviado[] = [];
    if (contexto?.donoId) {
      try {
        const todos = await listarExercicios(contexto.donoId);
        lidos = todos
          .filter((e) => e.naRotina)
          .sort((a, b) => a.criadoEm - b.criadoEm)
          .map((e) => ({ id: e.id, nome: e.nome, categoria: e.categoria, equipamento: e.equipamento, obterAudio: () => Promise.resolve(e.audio) }));
      } catch {
        // sem biblioteca neste navegador: a rotina padrão continua
      }
    }
    if (minha !== versao) return;
    enviados = lidos;
    passos = montarRotina(enviados);
    if (atual >= passos.length) fecharPlayer();
    desenhar();
  }

  // ---------- Lista do dia ----------

  function desenhar() {
    const est = estados();
    const daRotina = passos.filter((p) => p.bloco !== 'extra');
    const feitos = daRotina.filter((p) => est[p.id]).length;
    const tempoTotal = daRotina.reduce((s, p) => s + duracaoPasso(p), 0);
    const progresso = lerProgresso(contaId());
    const seq = sequencia(progresso.concluidos, hoje());
    const concluido = progresso.concluidos.includes(hoje());

    const professor = contexto?.papel === 'professor';
    el('treinoEyebrow').textContent = professor ? 'Rotina dos alunos' : 'Treino de hoje';
    el('treinoLead').textContent = professor
      ? 'É a rotina que seus alunos fazem: aparelhos, técnica, os exercícios que você mandar e desaquecimento. Na Biblioteca, toque em "Mandar para a rotina".'
      : contexto?.papel === 'aluno-independente'
        ? 'Como na academia: comece pelos aparelhos, siga a técnica, faça os seus exercícios e termine desaquecendo.'
        : 'Como na academia: comece pelos aparelhos, siga a técnica, faça os exercícios do professor e termine desaquecendo.';
    botaoComecar.textContent = concluido ? 'Treinar de novo' : feitos ? 'Continuar treino' : 'Começar treino';

    stats.replaceChildren();
    const itens: [string, string][] = [
      [`${feitos}/${daRotina.length}`, 'exercícios hoje'],
      [`${Math.round(tempoTotal / 60)} min`, 'duração da rotina'],
      [String(seq), seq === 1 ? 'dia seguido' : 'dias seguidos'],
      [`${naSemana(progresso.concluidos, hoje())}/7`, 'treinos na semana'],
    ];
    for (const [valor, rotulo] of itens) {
      const item = criar('div', 'week-stat');
      item.append(criar('b', undefined, valor), criar('span', undefined, rotulo));
      stats.append(item);
    }
    const barra = criar('div', 'treino-barra');
    const cheio = criar('i');
    cheio.style.width = `${daRotina.length ? (feitos / daRotina.length) * 100 : 0}%`;
    barra.append(cheio);
    stats.append(barra);

    lista.replaceChildren();
    if (concluido) {
      const festa = criar('div', 'treino-fim');
      festa.append(
        criar('b', undefined, 'Treino de hoje concluído! 🎉'),
        criar('span', undefined, seq > 1 ? `São ${seq} dias seguidos. Continue amanhã para manter a sequência.` : 'Primeiro dia da sequência. Volte amanhã para continuar.'),
      );
      lista.append(festa);
    }
    let blocoAtual = '';
    let caixa: HTMLElement | null = null;
    passos.forEach((p, i) => {
      if (p.bloco !== blocoAtual) {
        blocoAtual = p.bloco;
        caixa = criar('section', 'treino-bloco');
        caixa.dataset.bloco = p.bloco;
        caixa.append(criar('h2', undefined, nomeBloco(p.bloco)));
        lista.append(caixa);
      }
      caixa!.append(linhaPasso(p, i, est[p.id]));
    });
    // O bloco do professor aparece mesmo vazio, explicando como enche.
    if (!enviados.length) {
      const blocoProf = criar('section', 'treino-bloco');
      blocoProf.append(criar('h2', undefined, nomeBloco('professor')));
      const aviso = criar('p', 'muted small');
      aviso.textContent =
        contexto?.papel === 'professor'
          ? 'Nenhum exercício enviado. Na Biblioteca, toque em "Mandar para a rotina" nos exercícios que a turma deve fazer.'
          : contexto?.papel === 'aluno-independente'
            ? 'Nenhum exercício seu na rotina. Na Biblioteca, toque em "Mandar para a rotina" nos que quiser treinar todo dia.'
            : 'Seu professor ainda não mandou exercícios para a rotina.';
      blocoProf.append(aviso);
      lista.insertBefore(blocoProf, lista.querySelector('[data-bloco="final"]'));
    }
  }

  function linhaPasso(p: Passo, i: number, estado?: string): HTMLElement {
    const linha = criar('button', `treino-passo${estado ? ` ${estado}` : ''}${i === atual ? ' atual' : ''}`);
    linha.type = 'button';
    const marca = criar('span', 'treino-marca', estado ? ICONE[estado] : String(i + 1));
    const texto = criar('span', 'treino-texto');
    texto.append(criar('b', undefined, p.exercicio.nome));
    const detalhes = [p.tipo === 'padrao' ? p.exercicio.aparelho : p.exercicio.equipamento, p.tipo === 'padrao' && p.exercicio.tipo === 'vocalise' ? 'com piano' : p.tipo === 'professor' ? (sozinho() ? 'seu áudio' : 'áudio do professor') : '']
      .filter(Boolean)
      .join(' · ');
    if (detalhes) texto.append(criar('small', undefined, detalhes));
    linha.append(marca, texto, criar('span', 'treino-tempo', minutos(duracaoPasso(p))));
    linha.setAttribute('aria-label', `${i + 1}. ${p.exercicio.nome}${estado === 'feito' ? ', feito' : estado === 'pulado' ? ', pulado' : ''}. Abrir`);
    linha.addEventListener('click', () => abrirPasso(i));
    return linha;
  }

  botaoComecar.addEventListener('click', () => {
    const p = lerProgresso(contaId());
    if (p.concluidos.includes(hoje())) reiniciarDia(contaId(), hoje());
    const est = estados();
    const proximo = passos.findIndex((x) => x.bloco !== 'extra' && !est[x.id]);
    abrirPasso(proximo < 0 ? 0 : proximo);
  });

  // ---------- Player ----------

  function pararCronometro() {
    rodando = false;
    cancelAnimationFrame(quadro);
    void wake?.release().catch(() => {});
    wake = null;
  }

  function fecharPlayer() {
    pararCronometro();
    atual = -1;
    player.hidden = true;
    desenhar();
  }

  function abrirPasso(i: number) {
    pararCronometro();
    atual = i;
    const p = passos[i];
    if (!p) return fecharPlayer();
    total = duracaoPasso(p);
    restante = total;
    player.hidden = false;
    desenharPlayer();
    desenhar();
    requestAnimationFrame(() => player.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function desenharPlayer() {
    const p = passos[atual];
    if (!p) return;
    player.replaceChildren();

    const topo = criar('div', 'player-topo');
    const naRotina = passos.filter((x) => x.bloco !== 'extra').length;
    topo.append(criar('span', 'muted small', p.bloco === 'extra' ? 'Exercício avulso' : `Exercício ${atual + 1} de ${naRotina} · ${nomeBloco(p.bloco)}`));
    const fechar = criar('button', 'icon-btn');
    fechar.type = 'button';
    fechar.setAttribute('aria-label', 'Fechar exercício');
    fechar.innerHTML = '<svg><use href="#i-fechar"/></svg>';
    fechar.addEventListener('click', fecharPlayer);
    topo.append(fechar);

    const titulo = criar('h2', 'player-titulo', p.exercicio.nome);
    const tags = criar('div', 'tags');
    const aparelho = p.tipo === 'padrao' ? p.exercicio.aparelho : p.exercicio.equipamento;
    if (aparelho) tags.append(criar('span', 'tag accent', aparelho));
    tags.append(criar('span', 'tag', nomeCategoria.get(p.exercicio.categoria) ?? 'Exercício'));
    if (p.tipo === 'padrao' && p.exercicio.tipo === 'tempo' && p.exercicio.series) tags.append(criar('span', 'tag', p.exercicio.series));
    player.append(topo, titulo, tags);

    if (p.tipo === 'padrao') {
      player.append(criar('p', 'player-objetivo', p.exercicio.objetivo));
      corpoPadrao(p.exercicio);
    } else {
      player.append(criar('p', 'player-objetivo', sozinho() ? 'Um exercício da sua biblioteca. Cante junto com o áudio e veja a afinação no gráfico.' : 'Exercício enviado pelo professor. Cante junto com o áudio e veja a afinação no gráfico.'));
      botaoCantar(() => opcoes.praticar({ id: p.exercicio.id, nome: p.exercicio.nome, obterAudio: p.exercicio.obterAudio }));
    }

    // Rodapé: pular, concluir, e o que vem depois.
    const rodape = criar('div', 'player-rodape');
    const proximo = p.bloco === 'extra' ? undefined : passos.slice(atual + 1).find((x) => x.bloco !== 'extra');
    rodape.append(criar('span', 'muted small', proximo ? `Depois: ${proximo.exercicio.nome} · ${minutos(duracaoPasso(proximo))}` : 'Último exercício do treino'));
    const acoes = criar('div', 'player-acoes');
    const pular = criar('button', 'btn ghost', 'Pular');
    pular.type = 'button';
    pular.addEventListener('click', () => registrar('pulado'));
    const concluir = criar('button', 'btn primary', p.bloco === 'extra' ? 'Concluir' : proximo ? 'Concluir e seguir' : 'Concluir treino');
    concluir.type = 'button';
    concluir.addEventListener('click', () => registrar('feito'));
    acoes.append(pular, concluir);
    rodape.append(acoes);
    player.append(rodape);
  }

  function corpoPadrao(e: ExercicioPadrao) {
    if (e.tipo === 'tempo') player.append(cronometro());
    else botaoCantar(() => void praticarVocalise(e));

    const passosLista = criar('ol', 'player-instrucoes');
    for (const t of e.instrucoes) passosLista.append(criar('li', undefined, t));
    player.append(passosLista);

    if (e.tipo === 'tempo' && e.textos?.length) {
      const textos = criar('div', 'player-textos');
      for (const t of e.textos) textos.append(criar('blockquote', undefined, t));
      player.append(textos);
    }
    if (e.dica) player.append(criar('p', 'player-dica', e.dica));
  }

  function botaoCantar(acao: () => void) {
    const caixa = criar('div', 'player-cantar');
    const botao = criar('button', 'btn primary lg', 'Cantar com o piano');
    botao.type = 'button';
    botao.addEventListener('click', acao);
    caixa.append(botao, criar('span', 'muted small', 'Abre o gráfico no Afinador. Use fones. Depois volte ao Treino e toque em "Concluir".'));
    player.append(caixa);
  }

  async function praticarVocalise(e: ExercicioVocalise) {
    const voz = opcoes.conta()?.voz ?? '';
    opcoes.praticar({
      id: idPratica(e),
      nome: e.nome,
      obterAudio: () => gerarVocalise(notasDoVocalise(e, tonicaPara(voz)), opcoes.a4()),
    });
  }

  function cronometro(): HTMLElement {
    const caixa = criar('div', 'cronometro');
    const visor = criar('div', 'cronometro-visor', mmss(restante));
    visor.setAttribute('role', 'timer');
    visor.setAttribute('aria-live', 'off');
    const anel = criar('div', 'cronometro-barra');
    const cheio = criar('i');
    anel.append(cheio);
    const botoes = criar('div', 'cronometro-botoes');
    const iniciar = criar('button', 'btn primary', 'Iniciar');
    iniciar.type = 'button';
    const mais = criar('button', 'btn secondary', '+30 s');
    mais.type = 'button';
    const zerar = criar('button', 'btn ghost', 'Reiniciar');
    zerar.type = 'button';
    botoes.append(iniciar, mais, zerar);
    caixa.append(visor, anel, botoes);

    const pintar = () => {
      visor.textContent = mmss(Math.ceil(restante));
      cheio.style.width = `${total ? ((total - restante) / total) * 100 : 0}%`;
      iniciar.textContent = rodando ? 'Pausar' : restante <= 0 ? 'Pronto!' : restante < total ? 'Continuar' : 'Iniciar';
      caixa.classList.toggle('fim', restante <= 0);
    };
    const tique = (agora: number) => {
      if (!rodando) return;
      restante -= (agora - ultimoTique) / 1000;
      ultimoTique = agora;
      if (restante <= 0) {
        restante = 0;
        pararCronometro();
        avisarFim();
      }
      pintar();
      if (rodando) quadro = requestAnimationFrame(tique);
    };
    iniciar.addEventListener('click', async () => {
      if (restante <= 0) return registrar('feito');
      if (rodando) {
        pararCronometro();
      } else {
        rodando = true;
        ultimoTique = performance.now();
        quadro = requestAnimationFrame(tique);
        audio(); // libera o áudio do bipe com este clique
        try {
          wake = (await navigator.wakeLock?.request('screen')) ?? null;
        } catch {
          wake = null;
        }
      }
      pintar();
    });
    mais.addEventListener('click', () => {
      restante += 30;
      total = Math.max(total, restante);
      pintar();
    });
    zerar.addEventListener('click', () => {
      pararCronometro();
      restante = total;
      pintar();
    });
    pintar();
    return caixa;
  }

  function registrar(estado: 'feito' | 'pulado') {
    const p = passos[atual];
    if (!p || !contaId()) return;
    marcar(contaId(), hoje(), p.id, estado);
    const est = estados();
    if (p.bloco === 'extra') return fecharPlayer();
    const daRotina = passos.filter((x) => x.bloco !== 'extra');
    if (daRotina.every((x) => est[x.id]) && !lerProgresso(contaId()).concluidos.includes(hoje())) {
      concluirDia(contaId(), hoje());
      fecharPlayer();
      lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Vai para o próximo que ainda não foi feito.
    const pendente = (x: Passo, i: number) => x.bloco !== 'extra' && !est[x.id] && i !== atual;
    const depois = passos.findIndex((x, i) => i > atual && pendente(x, i));
    const qualquer = passos.findIndex(pendente);
    if (depois < 0 && qualquer < 0) return fecharPlayer();
    abrirPasso(depois >= 0 ? depois : qualquer);
  }

  // ---------- Exercícios padrão avulsos ----------

  function desenharPadroes() {
    padroes.replaceChildren();
    const porCategoria = new Map<string, ExercicioPadrao[]>();
    for (const e of EXERCICIOS_PADRAO) porCategoria.set(e.categoria, [...(porCategoria.get(e.categoria) ?? []), e]);
    for (const [cat, itens] of porCategoria) {
      const grupo = criar('div', 'padroes-grupo');
      grupo.append(criar('h3', undefined, nomeCategoria.get(cat) ?? cat));
      for (const e of itens) {
        const item = criar('button', 'padrao-item');
        item.type = 'button';
        const texto = criar('span', 'treino-texto');
        texto.append(criar('b', undefined, e.nome), criar('small', undefined, [e.aparelho, e.tipo === 'vocalise' ? 'com piano' : ''].filter(Boolean).join(' · ') || e.objetivo));
        item.append(texto, criar('span', 'treino-tempo', minutos(duracaoDe(e))));
        item.addEventListener('click', () => abrirAvulso(e));
        grupo.append(item);
      }
      padroes.append(grupo);
    }
  }

  /** Abre um exercício padrão fora da rotina: se ele faz parte da rotina, abre o passo dele. */
  function abrirAvulso(e: ExercicioPadrao) {
    const i = passos.findIndex((p) => p.tipo === 'padrao' && p.exercicio.id === e.id);
    if (i >= 0) return abrirPasso(i);
    // Fora da rotina: entra como extra no fim da lista de hoje (não conta para concluir o treino).
    const j = passos.findIndex((p) => p.id === `extra:${e.id}`);
    if (j >= 0) return abrirPasso(j);
    passos = [...passos, { id: `extra:${e.id}`, tipo: 'padrao', bloco: 'extra', exercicio: e }];
    abrirPasso(passos.length - 1);
  }

  desenharPadroes();

  return {
    definirContexto(novo) {
      contexto = novo;
      fecharPlayer();
      void carregarEnviados();
    },
    atualizar() {
      void carregarEnviados();
    },
  };
}
