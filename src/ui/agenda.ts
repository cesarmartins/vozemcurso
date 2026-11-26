import { DIAS, DIAS_CURTOS, duracaoTexto, fimMin, hora, inicioMin, minutosPorSemana, ORDEM_SEMANA, ordenar, proximas, proximaVez, type Aula } from '../agenda/horarios';
import { ErroConta, servidor, type Conta, type Turma } from '../contas';

// Tela "Agenda" do professor: a semana com as aulas fixas de cada aluno,
// o formulário de aula e o quadro "Aulas de hoje" do painel.

export interface ControleAgenda {
  /** Redesenha com a turma mais recente do professor. */
  mostrar(professor: Conta, turma: Turma): void;
  /** Abre o formulário: nova aula (opcionalmente já com o aluno) ou edição. */
  abrirForm(opcoes?: { email?: string; aula?: Aula }): void;
}

export interface OpcoesAgenda {
  /** Algo mudou na agenda: o portal recarrega a turma e chama mostrar() de novo. */
  aoMudar: () => void;
  irParaAgenda: () => void;
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

const faixa = (a: Aula) => `${hora(inicioMin(a))}–${hora(fimMin(a))}`;
const modalidadeTexto = (a: Aula) => (a.modalidade === 'online' ? 'Online' : 'Presencial');

/** Nome de cada aluno da turma pelo e-mail (com conta ou só convidado). */
export function nomesDaTurma(turma: Turma): Map<string, string> {
  return new Map([...turma.convites.map((c) => [c.email, c.nome] as const), ...turma.alunos.map((a) => [a.email, a.nome] as const)]);
}

/** Linha de aula para listas: "Terça · 14:00–15:00 · Presencial · Sala 2". */
export function linhaAula(a: Aula, opcoes: { titulo?: string; aoEditar?: () => void } = {}): HTMLElement {
  const linha = criar('div', 'class-line');
  const quando = criar('span', 'class-when');
  quando.append(criar('b', undefined, DIAS[a.dia]), criar('span', undefined, faixa(a)));
  const detalhe = criar('span', 'class-what');
  if (opcoes.titulo) detalhe.append(criar('b', undefined, opcoes.titulo));
  const extra = [modalidadeTexto(a), duracaoTexto(a.duracao), a.local].filter(Boolean).join(' · ');
  detalhe.append(criar('small', undefined, extra));
  linha.append(quando, detalhe);
  if (opcoes.aoEditar) {
    const editar = criar('button', 'btn ghost sm', 'Editar');
    editar.type = 'button';
    editar.addEventListener('click', opcoes.aoEditar);
    linha.append(editar);
  }
  return linha;
}

/** "Ter 14:00 · Qui 18:30" ou "Sem horário". */
export const resumoAulas = (aulas: Aula[]) =>
  aulas.length ? ordenar(aulas).map((a) => `${DIAS_CURTOS[a.dia]} ${a.inicio}`).join(' · ') : 'Sem horário';

export function iniciarAgenda(opcoes: OpcoesAgenda): ControleAgenda {
  const painelForm = el('classPanel');
  const form = el<HTMLFormElement>('classForm');
  const selAluno = el<HTMLSelectElement>('classStudent');
  const selDia = el<HTMLSelectElement>('classDay');
  const aviso = el('classStatus');
  const excluir = el<HTMLButtonElement>('deleteClassBtn');
  const titulo = el('classFormTitle');
  const semana = el('weekGrid');
  const resumo = el('weekSummary');
  const hoje = el('todayList');

  for (const d of ORDEM_SEMANA) selDia.add(new Option(DIAS[d], String(d)));

  let professor: Conta | null = null;
  let turma: Turma | null = null;
  let editando: Aula | null = null;

  const status = (texto: string, tipo: 'ok' | 'erro' | '' = '') => {
    aviso.textContent = texto;
    aviso.classList.toggle('is-ok', tipo === 'ok');
    aviso.classList.toggle('is-error', tipo === 'erro');
  };

  function fecharForm() {
    painelForm.hidden = true;
    editando = null;
    el('newClassBtn').hidden = false;
  }

  function abrirForm({ email, aula }: { email?: string; aula?: Aula } = {}) {
    if (!turma) return;
    opcoes.irParaAgenda();
    editando = aula ?? null;
    form.reset();
    status('');
    preencherAlunos();
    titulo.textContent = aula ? 'Editar aula' : 'Nova aula';
    excluir.hidden = !aula;
    if (aula) {
      selAluno.value = aula.alunoEmail;
      selDia.value = String(aula.dia);
      el<HTMLInputElement>('classStart').value = aula.inicio;
      garantirDuracao(aula.duracao);
      el<HTMLSelectElement>('classMode').value = aula.modalidade;
      el<HTMLInputElement>('classPlace').value = aula.local;
    } else if (email) {
      selAluno.value = email;
    }
    painelForm.hidden = false;
    el('newClassBtn').hidden = true;
    requestAnimationFrame(() => {
      painelForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      (aula || email ? el<HTMLInputElement>('classStart') : selAluno).focus({ preventScroll: true });
    });
  }

  /** Aula antiga com duração fora da lista (ex.: 40 min) continua editável. */
  function garantirDuracao(min: number) {
    const sel = el<HTMLSelectElement>('classDuration');
    if (!Array.from(sel.options).some((o) => o.value === String(min))) sel.add(new Option(duracaoTexto(min), String(min)));
    sel.value = String(min);
  }

  function preencherAlunos() {
    if (!turma) return;
    const atual = selAluno.value;
    selAluno.replaceChildren(new Option('Escolha o aluno', ''));
    const nomes = [...nomesDaTurma(turma)].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    for (const [email, nome] of nomes) selAluno.add(new Option(nome, email));
    selAluno.value = atual;
  }

  el('newClassBtn').addEventListener('click', () => abrirForm());
  el('closeClassForm').addEventListener('click', fecharForm);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!professor) return;
    const dados = new FormData(form);
    const botao = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (botao) botao.disabled = true;
    try {
      await servidor.salvarAula(professor.id, {
        id: editando?.id,
        alunoEmail: String(dados.get('student') ?? ''),
        dia: Number(dados.get('day')),
        inicio: String(dados.get('start') ?? ''),
        duracao: Number(dados.get('duration')),
        modalidade: dados.get('mode') === 'online' ? 'online' : 'presencial',
        local: String(dados.get('place') ?? ''),
      });
      fecharForm();
      opcoes.aoMudar();
    } catch (erro) {
      status(erro instanceof ErroConta ? erro.message : 'Não consegui salvar a aula.', 'erro');
    } finally {
      if (botao) botao.disabled = false;
    }
  });

  excluir.addEventListener('click', async () => {
    if (!professor || !editando) return;
    const nome = turma ? nomesDaTurma(turma).get(editando.alunoEmail) : '';
    if (!window.confirm(`Excluir a aula de ${nome} (${DIAS[editando.dia]}, ${faixa(editando)})?`)) return;
    await servidor.excluirAula(professor.id, editando.id);
    fecharForm();
    opcoes.aoMudar();
  });

  function desenharSemana() {
    if (!turma) return;
    const nomes = nomesDaTurma(turma);
    const aulas = turma.aulas;
    const total = minutosPorSemana(aulas);
    resumo.replaceChildren();
    if (!nomes.size) {
      const vazio = criar('div', 'empty');
      vazio.append(criar('b', undefined, 'Nenhum aluno na turma'), criar('span', undefined, 'Cadastre os alunos no Painel e depois marque os horários aqui.'));
      resumo.append(vazio);
    } else {
      const alunosComAula = new Set(aulas.map((a) => a.alunoEmail)).size;
      const itens: [string, string][] = [
        [String(aulas.length), aulas.length === 1 ? 'aula por semana' : 'aulas por semana'],
        [duracaoTexto(total || 0).replace(/^0 min$/, '0h'), 'de aula na semana'],
        [`${alunosComAula} de ${nomes.size}`, 'alunos com horário'],
      ];
      for (const [valor, rotulo] of itens) {
        const item = criar('div', 'week-stat');
        item.append(criar('b', undefined, valor), criar('span', undefined, rotulo));
        resumo.append(item);
      }
    }

    semana.replaceChildren();
    semana.hidden = !nomes.size;
    const diaHoje = new Date().getDay();
    for (const d of ORDEM_SEMANA) {
      const coluna = criar('section', d === diaHoje ? 'day today' : 'day');
      coluna.setAttribute('aria-label', DIAS[d]);
      const cab = criar('header', 'day-head');
      cab.append(criar('b', undefined, DIAS[d]), criar('span', undefined, d === diaHoje ? 'hoje' : ''));
      coluna.append(cab);
      const doDia = ordenar(aulas.filter((a) => a.dia === d));
      for (const a of doDia) {
        const chip = criar('button', a.modalidade === 'online' ? 'class-chip online' : 'class-chip');
        chip.type = 'button';
        chip.append(criar('b', undefined, faixa(a)), criar('span', undefined, nomes.get(a.alunoEmail) ?? a.alunoEmail), criar('small', undefined, modalidadeTexto(a)));
        chip.setAttribute('aria-label', `${nomes.get(a.alunoEmail)}, ${DIAS[d]} ${faixa(a)}, ${modalidadeTexto(a)}. Editar`);
        chip.addEventListener('click', () => abrirForm({ aula: a }));
        coluna.append(chip);
      }
      const novo = criar('button', 'day-add', '+ Aula');
      novo.type = 'button';
      novo.setAttribute('aria-label', `Nova aula na ${DIAS[d].toLowerCase()}`);
      novo.addEventListener('click', () => {
        abrirForm();
        selDia.value = String(d);
      });
      coluna.append(novo);
      semana.append(coluna);
    }
  }

  function desenharHoje() {
    if (!turma) return;
    const nomes = nomesDaTurma(turma);
    const agora = new Date();
    hoje.replaceChildren();
    const deHoje = ordenar(turma.aulas.filter((a) => a.dia === agora.getDay()));
    if (deHoje.length) {
      const minAgora = agora.getHours() * 60 + agora.getMinutes();
      for (const a of deHoje) {
        const linha = linhaAula(a, { titulo: nomes.get(a.alunoEmail), aoEditar: () => abrirForm({ aula: a }) });
        if (fimMin(a) <= minAgora) linha.classList.add('past');
        else if (inicioMin(a) <= minAgora) linha.classList.add('now');
        hoje.append(linha);
      }
      return;
    }
    const vazio = criar('div', 'empty compact');
    const prox = proximas(turma.aulas, agora)[0];
    if (prox) {
      const quando = proximaVez(prox, agora).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
      vazio.append(criar('b', undefined, 'Nenhuma aula hoje'), criar('span', undefined, `Próxima: ${nomes.get(prox.alunoEmail)}, ${quando} às ${prox.inicio}.`));
    } else {
      vazio.append(criar('b', undefined, 'Nenhuma aula marcada'), criar('span', undefined, 'Monte a semana na Agenda.'));
    }
    hoje.append(vazio);
  }

  return {
    mostrar(novoProfessor, novaTurma) {
      if (professor?.id !== novoProfessor.id) fecharForm();
      professor = novoProfessor;
      turma = novaTurma;
      if (!painelForm.hidden) preencherAlunos();
      desenharSemana();
      desenharHoje();
    },
    abrirForm,
  };
}
