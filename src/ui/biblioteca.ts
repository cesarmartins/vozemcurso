import { CATEGORIAS, EXERCICIOS_INCLUIDOS, type CategoriaId } from '../exercicios/catalogo';
import { adicionarExercicio, definirNaRotina, excluirExercicio, listarExercicios, type ExercicioPessoal } from '../exercicios/biblioteca';
import { carregarResultados, resultadosDe } from '../exercicios/resultados';

interface ExercicioVisivel {
  id: string;
  nome: string;
  categoria: CategoriaId;
  equipamento: string;
  audioUrl: string;
  arquivoNome: string;
  pessoal: boolean;
  obterAudio: () => Promise<Blob>;
  /** O registro guardado, para poder alterar (ex.: mandar para a rotina). */
  original?: ExercicioPessoal;
}

export interface ExercicioParaPraticar {
  id: string;
  nome: string;
  obterAudio: () => Promise<Blob>;
}

/** Quem está usando a biblioteca: o aluno de turma só pratica; os outros também cadastram. */
export type Papel = 'professor' | 'aluno-turma' | 'aluno-independente';

export interface ContextoBiblioteca {
  papel: Papel;
  /** De quem são os exercícios mostrados: o professor da turma ou a própria conta. */
  donoId: string | null;
  /** De quem são as práticas mostradas nos cartões (a turma inteira, para o professor). */
  contasResultados: string[];
}

export interface ControleBiblioteca {
  definirContexto(contexto: ContextoBiblioteca): void;
  /** Redesenha os cartões (por exemplo, depois de salvar uma prática). */
  atualizar(): void;
}

type Filtro = CategoriaId | 'todas';

/** Entra em "Exercícios com aparelhos": a categoria ou qualquer exercício que diga qual aparelho usa. */
const comAparelho = (e: ExercicioVisivel) => e.categoria === 'aparelhos' || e.equipamento !== '';
const pertence = (e: ExercicioVisivel, filtro: Filtro) =>
  filtro === 'todas' || (filtro === 'aparelhos' ? comAparelho(e) : e.categoria === filtro);
const SEM_APARELHO = 'Aparelho não informado';

/** Aproveitamento médio das práticas de um exercício, de 0 a 1 (ou null se nunca praticado). */
function aproveitamento(id: string, contas: readonly string[]): number | null {
  const historico = resultadosDe(id, contas).filter((r) => r.avaliadas > 0);
  if (!historico.length) return null;
  return historico.reduce((soma, r) => soma + r.acertos / r.avaliadas, 0) / historico.length;
}

const porId = new Map(CATEGORIAS.map((categoria) => [categoria.id, categoria] as const));
const mmss = (s: number) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––');
const ICONE_TOCAR = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
const ICONE_PAUSAR = '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>';

function criar<T extends keyof HTMLElementTagNameMap>(tag: T, classe?: string, texto?: string): HTMLElementTagNameMap[T] {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto) no.textContent = texto;
  return no;
}

async function baixarAudio(url: string): Promise<Blob> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error('Não consegui baixar o áudio deste exercício.');
  return resposta.blob();
}

/** Só um áudio de prévia toca por vez. */
let tocandoAgora: HTMLAudioElement | null = null;

function criarPlayer(url: string, rotulo: string): HTMLElement {
  const caixa = criar('div', 'player');
  const botao = criar('button', 'play-btn');
  botao.type = 'button';
  botao.innerHTML = ICONE_TOCAR;
  botao.setAttribute('aria-label', `Ouvir ${rotulo}`);
  const trilha = criar('div', 'player-track');
  const progresso = criar('i');
  trilha.append(progresso);
  const tempo = criar('span', 'player-time', '–:––');
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.src = url;
  const pintar = () => {
    const tocando = !audio.paused;
    botao.innerHTML = tocando ? ICONE_PAUSAR : ICONE_TOCAR;
    botao.setAttribute('aria-label', `${tocando ? 'Pausar' : 'Ouvir'} ${rotulo}`);
  };
  audio.addEventListener('loadedmetadata', () => (tempo.textContent = mmss(audio.duration)));
  audio.addEventListener('timeupdate', () => {
    progresso.style.width = `${(audio.currentTime / (audio.duration || 1)) * 100}%`;
    tempo.textContent = mmss(audio.paused && audio.currentTime === 0 ? audio.duration : audio.currentTime);
  });
  audio.addEventListener('play', pintar);
  audio.addEventListener('pause', pintar);
  audio.addEventListener('ended', () => {
    audio.currentTime = 0;
    pintar();
  });
  botao.addEventListener('click', () => {
    if (audio.paused) {
      if (tocandoAgora && tocandoAgora !== audio) tocandoAgora.pause();
      tocandoAgora = audio;
      void audio.play();
    } else audio.pause();
  });
  caixa.append(botao, trilha, tempo);
  return caixa;
}

const NENHUM: ControleBiblioteca = { definirContexto: () => {}, atualizar: () => {} };

export interface OpcoesBiblioteca {
  aoPraticar: (ex: ExercicioParaPraticar) => void;
  /** Leva o usuário para a tela da biblioteca (usado pelo cartão do painel). */
  irParaBiblioteca: () => void;
  /** Um exercício entrou ou saiu da rotina de treino. */
  aoMudarRotina?: () => void;
}

export function iniciarBiblioteca(opcoes: OpcoesBiblioteca): ControleBiblioteca {
  const formulario = document.querySelector<HTMLFormElement>('#exerciseForm');
  const painelForm = document.querySelector<HTMLElement>('#exercisePanel');
  const botaoNovo = document.querySelector<HTMLButtonElement>('#newExerciseBtn');
  const fecharForm = document.querySelector<HTMLButtonElement>('#closeExerciseForm');
  const seletor = document.querySelector<HTMLSelectElement>('#exerciseCategory');
  const filtros = document.querySelector<HTMLElement>('#categoryFilter');
  const grade = document.querySelector<HTMLElement>('#exerciseCategories');
  const aviso = document.querySelector<HTMLElement>('#libraryNote');
  const lead = document.querySelector<HTMLElement>('#libLead');
  const eyebrow = document.querySelector<HTMLElement>('#libEyebrow');
  const corpoAparelhos = document.querySelector<HTMLElement>('#deviceBody');
  const verAparelhos = document.querySelector<HTMLButtonElement>('#deviceSeeAll');
  const novoAparelho = document.querySelector<HTMLButtonElement>('#deviceNew');
  if (!formulario || !painelForm || !botaoNovo || !fecharForm || !seletor || !filtros || !grade || !aviso) return NENHUM;

  for (const categoria of CATEGORIAS) seletor.add(new Option(categoria.nome, categoria.id));

  let contexto: ContextoBiblioteca = { papel: 'professor', donoId: null, contasResultados: [] };
  const podeEditar = () => contexto.papel !== 'aluno-turma';
  let filtro: Filtro = 'todas';
  let exercicios: ExercicioVisivel[] = [];
  let versao = 0;

  const avisar = (texto: string, tipo: 'ok' | 'erro' | '' = '') => {
    aviso.textContent = texto;
    aviso.classList.toggle('is-ok', tipo === 'ok');
    aviso.classList.toggle('is-error', tipo === 'erro');
  };

  const abrirForm = (abrir: boolean) => {
    painelForm.hidden = !abrir;
    botaoNovo.hidden = abrir || !podeEditar();
    if (abrir) formulario.querySelector<HTMLInputElement>('#exerciseName')?.focus();
  };
  botaoNovo.addEventListener('click', () => abrirForm(true));
  fecharForm.addEventListener('click', () => abrirForm(false));

  const mostrarAparelhos = () => {
    filtro = 'aparelhos';
    abrirForm(false);
    desenhar();
    opcoes.irParaBiblioteca();
  };
  verAparelhos?.addEventListener('click', mostrarAparelhos);
  novoAparelho?.addEventListener('click', () => {
    filtro = 'aparelhos';
    desenhar();
    opcoes.irParaBiblioteca();
    seletor.value = 'aparelhos';
    abrirForm(true);
  });

  /** Lê a biblioteca do armazenamento e redesenha tudo. */
  async function carregar() {
    const minhaVersao = ++versao;
    let pessoais: ExercicioPessoal[];
    try {
      [pessoais] = await Promise.all([contexto.donoId ? listarExercicios(contexto.donoId) : Promise.resolve([]), carregarResultados(contexto.contasResultados)]);
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Não foi possível abrir a biblioteca neste navegador.', 'erro');
      return;
    }
    if (minhaVersao !== versao) return;
    tocandoAgora?.pause();
    exercicios = [
      ...EXERCICIOS_INCLUIDOS.map((item) => ({
        id: item.id,
        nome: item.nome,
        categoria: item.categoria,
        equipamento: item.equipamento ?? '',
        audioUrl: item.audioUrl,
        arquivoNome: item.audioUrl.split('/').pop() ?? item.audioUrl,
        pessoal: false,
        obterAudio: () => baixarAudio(item.audioUrl),
      })),
      ...pessoais
        .sort((a, b) => b.criadoEm - a.criadoEm)
        .map((item) => ({
          id: item.id,
          nome: item.nome,
          categoria: item.categoria,
          equipamento: item.equipamento,
          audioUrl: item.audioUrl,
          arquivoNome: item.arquivoNome,
          pessoal: true,
          obterAudio: item.obterAudio,
          original: item,
        })),
    ];
    desenhar();
  }

  function desenhar() {
    // Filtros: "Todas" e cada categoria com sua contagem.
    filtros!.replaceChildren();
    const opcoesFiltro: { id: Filtro; nome: string; total: number }[] = [
      { id: 'todas', nome: 'Todas', total: exercicios.length },
      ...CATEGORIAS.map((c) => ({ id: c.id as Filtro, nome: c.nome, total: exercicios.filter((e) => pertence(e, c.id)).length })),
    ];
    for (const op of opcoesFiltro) {
      const chip = criar('button', 'chip-btn');
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(filtro === op.id));
      chip.append(document.createTextNode(op.nome), criar('span', 'count', String(op.total)));
      chip.addEventListener('click', () => {
        filtro = op.id;
        desenhar();
      });
      filtros!.append(chip);
    }

    desenharAparelhos();
    const visiveis = exercicios.filter((e) => pertence(e, filtro));
    grade!.replaceChildren();
    if (!visiveis.length) {
      const vazio = criar('div', 'empty');
      const categoria = filtro === 'todas' ? null : porId.get(filtro);
      vazio.append(
        criar('b', undefined, categoria ? `Nada em ${categoria.nome} ainda` : 'A biblioteca está vazia'),
        criar('span', undefined, podeEditar() ? 'Toque em “Novo exercício” para enviar um áudio de piano.' : 'Seu professor ainda não adicionou exercícios aqui.'),
      );
      grade!.append(vazio);
      return;
    }
    for (const item of visiveis) grade!.append(criarCartao(item));
  }

  /** Cartão "Treinos com aparelhos" do painel do professor. */
  function desenharAparelhos() {
    if (!corpoAparelhos) return;
    corpoAparelhos.replaceChildren();
    const treinos = exercicios.filter(comAparelho);
    if (verAparelhos) verAparelhos.hidden = !treinos.length;

    if (!treinos.length) {
      const vazio = criar('div', 'empty');
      const sugestoes = criar('div', 'tags');
      for (const nome of ['Respirom', 'Lax Vox', 'Shaker', 'Canudo']) sugestoes.append(criar('span', 'tag accent', nome));
      vazio.append(
        criar('b', undefined, 'Nenhum treino com aparelho ainda'),
        criar('span', undefined, 'Grave o piano do exercício, envie o áudio e diga qual aparelho o aluno deve usar.'),
        sugestoes,
      );
      corpoAparelhos.append(vazio);
      return;
    }

    // Um bloco por aparelho, com quantos treinos tem e o aproveitamento médio dos alunos.
    const grupos = new Map<string, { nome: string; itens: ExercicioVisivel[] }>();
    for (const e of treinos) {
      const nome = e.equipamento || SEM_APARELHO;
      const chave = nome.toLocaleLowerCase('pt-BR');
      const grupo = grupos.get(chave) ?? { nome, itens: [] };
      grupo.itens.push(e);
      grupos.set(chave, grupo);
    }
    const grade = criar('div', 'device-grid');
    const ordenados = [...grupos.values()].sort(
      (a, b) => Number(a.nome === SEM_APARELHO) - Number(b.nome === SEM_APARELHO) || b.itens.length - a.itens.length || a.nome.localeCompare(b.nome, 'pt-BR'),
    );
    for (const grupo of ordenados) {
      const bloco = criar('button', 'device-tile');
      bloco.type = 'button';
      const notas = grupo.itens.map((e) => aproveitamento(e.id, contexto.contasResultados)).filter((v): v is number => v != null);
      const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
      const qtd = `${grupo.itens.length} ${grupo.itens.length === 1 ? 'treino' : 'treinos'}`;
      bloco.append(criar('b', undefined, grupo.nome), criar('small', undefined, media == null ? `${qtd} · sem práticas` : `${qtd} · ${Math.round(media * 100)}% de acerto`));
      if (media != null) {
        const barra = criar('div', 'result-bar');
        const cheio = criar('i');
        cheio.style.width = `${Math.round(media * 100)}%`;
        barra.append(cheio);
        bloco.append(barra);
      }
      bloco.setAttribute('aria-label', `${grupo.nome}: ${bloco.querySelector('small')?.textContent}. Ver treinos com aparelhos`);
      bloco.addEventListener('click', mostrarAparelhos);
      grade.append(bloco);
    }

    // Os mais recentes, para o professor testar rápido.
    const recentes = [...treinos.filter((e) => e.pessoal), ...treinos.filter((e) => !e.pessoal)].slice(0, 3);
    const lista = criar('div', 'device-list');
    for (const item of recentes) {
      const linha = criar('div', 'device-row');
      const texto = criar('div');
      const tags = criar('div', 'tags');
      tags.append(criar('span', 'tag accent', item.equipamento || SEM_APARELHO), criar('span', 'tag', porId.get(item.categoria)?.nome ?? 'Outros'));
      texto.append(criar('b', undefined, item.nome), tags);
      const nota = aproveitamento(item.id, contexto.contasResultados);
      const placar = criar('span', 'score', nota == null ? '—' : `${Math.round(nota * 100)}%`);
      placar.title = nota == null ? 'Ainda não praticado' : 'Aproveitamento médio';
      const praticar = criar('button', 'btn secondary sm', 'Praticar');
      praticar.type = 'button';
      praticar.setAttribute('aria-label', `Praticar ${item.nome}`);
      praticar.addEventListener('click', () => {
        tocandoAgora?.pause();
        opcoes.aoPraticar({ id: item.id, nome: item.nome, obterAudio: item.obterAudio });
      });
      linha.append(texto, placar, praticar);
      lista.append(linha);
    }
    corpoAparelhos.append(grade, criar('p', 'device-sub', 'Adicionados por último'), lista);
  }

  function criarCartao(item: ExercicioVisivel) {
    const cartao = criar('article', 'ex-card');

    const cabecalho = criar('div', 'ex-card-head');
    const titulos = criar('div');
    titulos.append(criar('h3', undefined, item.nome));
    const tags = criar('div', 'tags');
    tags.append(criar('span', 'tag', porId.get(item.categoria)?.nome ?? 'Outros'));
    if (item.equipamento) tags.append(criar('span', 'tag accent', item.equipamento));
    titulos.append(tags);
    cabecalho.append(titulos);
    if (item.pessoal && podeEditar()) {
      const remover = criar('button', 'link-danger', 'Remover');
      remover.type = 'button';
      remover.setAttribute('aria-label', `Remover ${item.nome} da biblioteca`);
      remover.addEventListener('click', async () => {
        if (!window.confirm(`Remover “${item.nome}” da biblioteca? O áudio e o histórico de práticas serão apagados.`)) return;
        try {
          if (item.original) await excluirExercicio(item.original);
          await carregar();
          avisar(`“${item.nome}” foi removido.`);
        } catch {
          avisar('Não foi possível remover o exercício.', 'erro');
        }
      });
      cabecalho.append(remover);
    }
    cartao.append(cabecalho, criarPlayer(item.audioUrl, item.nome));

    const historico = resultadosDe(item.id, contexto.contasResultados);
    const ultima = historico[historico.length - 1];
    const linha = criar('div', 'result-line');
    if (ultima) {
      const pct = ultima.avaliadas ? Math.round((ultima.acertos / ultima.avaliadas) * 100) : 0;
      const data = new Date(ultima.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const esquerda = criar('span');
      esquerda.append(document.createTextNode('Última prática '), criar('b', undefined, `${pct}%`));
      const melhor = Math.max(...historico.map((r) => (r.avaliadas ? r.acertos / r.avaliadas : 0)));
      const direita = criar(
        'span',
        undefined,
        `${data} · ${Math.round(ultima.desvioMedio)} cents${historico.length > 1 ? ` · melhor ${Math.round(melhor * 100)}%` : ''}`,
      );
      linha.append(esquerda, direita);
      const barra = criar('div', 'result-bar');
      const preenchido = criar('i');
      preenchido.style.width = `${pct}%`;
      barra.append(preenchido);
      cartao.append(linha, barra);
    } else {
      linha.append(criar('span', undefined, 'Ainda não praticado'));
      cartao.append(linha);
    }

    const praticar = criar('button', 'btn primary', 'Praticar com o afinador');
    praticar.type = 'button';
    praticar.addEventListener('click', () => {
      tocandoAgora?.pause();
      opcoes.aoPraticar({ id: item.id, nome: item.nome, obterAudio: item.obterAudio });
    });
    cartao.append(praticar);
    if (item.original && podeEditar()) {
      const original = item.original;
      const naRotina = !!original.naRotina;
      const rotina = criar('button', 'btn secondary sm rotina-btn', naRotina ? '✓ Na rotina de treino' : 'Mandar para a rotina');
      rotina.type = 'button';
      rotina.setAttribute('aria-pressed', String(naRotina));
      rotina.title = naRotina ? 'Toque para tirar da rotina' : 'Entra no bloco "Exercícios do professor" do Treino';
      rotina.addEventListener('click', async () => {
        try {
          await definirNaRotina(original.id, !naRotina);
          avisar(naRotina ? `“${item.nome}” saiu da rotina de treino.` : `“${item.nome}” entrou na rotina de treino.`, 'ok');
          await carregar();
          opcoes.aoMudarRotina?.();
        } catch {
          avisar('Não foi possível alterar a rotina.', 'erro');
        }
      });
      cartao.append(rotina);
    }
    cartao.append(criar('p', 'file', item.arquivoNome));
    return cartao;
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const dados = new FormData(formulario);
    const nome = String(dados.get('name') ?? '').trim();
    const categoria = String(dados.get('category') ?? '') as CategoriaId;
    const equipamento = String(dados.get('equipment') ?? '').trim();
    const arquivo = dados.get('audio');
    if (!contexto.donoId || !podeEditar()) return;
    if (!nome || !porId.has(categoria) || !(arquivo instanceof File) || arquivo.size === 0) {
      avisar('Preencha o nome, a categoria e escolha um arquivo de áudio.', 'erro');
      return;
    }
    const botao = formulario.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (botao) botao.disabled = true;
    try {
      avisar('Enviando o áudio…');
      await adicionarExercicio({ donoId: contexto.donoId, nome, categoria, equipamento, arquivo });
      formulario.reset();
      abrirForm(false);
      filtro = 'todas';
      await carregar();
      avisar(`“${nome}” foi adicionado em ${porId.get(categoria)?.nome}.`, 'ok');
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : 'Não foi possível salvar o áudio. Verifique o espaço disponível no navegador.', 'erro');
    } finally {
      if (botao) botao.disabled = false;
    }
  });

  const TEXTOS: Record<Papel, [string, string]> = {
    professor: ['Biblioteca', 'Áudios de piano organizados por categoria. Toque em “Praticar” para cantar com o gráfico.'],
    'aluno-turma': ['Exercícios do professor', 'Escolha um exercício e toque em “Praticar com o afinador”. Use fones de ouvido.'],
    'aluno-independente': ['Meus exercícios', 'Envie áudios de piano (seus ou do seu curso) e pratique com o gráfico. Use fones de ouvido.'],
  };

  return {
    definirContexto(novo) {
      contexto = { ...novo, contasResultados: [...novo.contasResultados] };
      filtro = 'todas';
      abrirForm(false);
      avisar('');
      const [titulo, texto] = TEXTOS[novo.papel];
      if (eyebrow) eyebrow.textContent = titulo;
      if (lead) lead.textContent = texto;
      void carregar();
    },
    atualizar() {
      void carregar();
    },
  };
}
