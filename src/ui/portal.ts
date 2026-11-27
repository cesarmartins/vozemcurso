import { ConfirmeEmail, ErroConta, servidor, type Conta, type Turma } from '../contas';
import { contarExercicios } from '../exercicios/biblioteca';
import { carregarResultados, totalPraticas } from '../exercicios/resultados';
import { iniciarAgenda, linhaAula, resumoAulas } from './agenda';
import type { ContextoBiblioteca } from './biblioteca';

// Entrada (login e cadastro), turma do professor e perfil do aluno.

export type Tela = 'painel' | 'agenda' | 'treino' | 'perfil' | 'biblioteca' | 'afinador';

export interface OpcoesPortal {
  /** Chamado ao entrar e sempre que muda o que a biblioteca deve mostrar. */
  aoMudarContexto: (contexto: ContextoBiblioteca) => void;
  /** Chamado ao sair da tela do afinador: parar áudio e microfone. */
  aoSairDoAfinador: () => void;
}

export interface ControlePortal {
  irPara(tela: Tela): void;
  /** Conta logada, ou null na tela de entrada. */
  conta(): Conta | null;
}

const TELAS: Tela[] = ['painel', 'agenda', 'treino', 'perfil', 'biblioteca', 'afinador'];

const iniciais = (texto: string) =>
  texto
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('') || '?';

const mensagem = (erro: unknown) => (erro instanceof ErroConta ? erro.message : 'Algo deu errado. Tente de novo.');

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

function status(alvo: HTMLElement, texto: string, tipo: 'ok' | 'erro' | '' = '') {
  alvo.textContent = texto;
  alvo.classList.toggle('is-ok', tipo === 'ok');
  alvo.classList.toggle('is-error', tipo === 'erro');
}

/** Desabilita o botão de envio enquanto a operação roda. */
async function enviando(form: HTMLFormElement, acao: () => Promise<void>) {
  const botao = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (botao?.disabled) return;
  if (botao) botao.disabled = true;
  try {
    await acao();
  } finally {
    if (botao) botao.disabled = false;
  }
}

export function iniciarPortal(opcoes: OpcoesPortal): ControlePortal {
  const telaLogin = el('loginPage');
  const app = el('appShell');
  const formEntrar = el<HTMLFormElement>('loginForm');
  const formCriar = el<HTMLFormElement>('signupForm');
  const campoCodigo = el('signupCodeField');
  const lista = el('studentList');
  const formAluno = el<HTMLFormElement>('studentForm');
  const formPerfil = el<HTMLFormElement>('profileForm');
  const formTurma = el<HTMLFormElement>('joinForm');
  const avisoTurma = el('teacherNotice');
  const avisoPerfil = el('profileNotice');
  const avisoEntrarTurma = el('joinNotice');
  const views = new Map(TELAS.map((t) => [t, el(`view-${t}`)] as const));

  let conta: Conta | null = null;
  /** Alunos ativos do professor logado: as práticas deles aparecem na biblioteca. */
  let idsTurma: string[] = [];
  let telaAtual: Tela | null = null;
  /** E-mail do aluno com a ficha aberta no painel. */
  let fichaAberta: string | null = null;

  const agenda = iniciarAgenda({ aoMudar: () => void atualizarTurma(), irParaAgenda: () => irPara('agenda') });

  // ---------- Navegação ----------

  function irPara(tela: Tela) {
    if (!conta) return;
    if ((tela === 'painel' || tela === 'agenda') && conta.tipo !== 'professor') tela = 'perfil';
    if (tela === 'perfil' && conta.tipo !== 'aluno') tela = 'painel';
    if (telaAtual === 'afinador' && tela !== 'afinador') opcoes.aoSairDoAfinador();
    telaAtual = tela;
    views.forEach((v, t) => (v.hidden = t !== tela));
    document.querySelectorAll<HTMLButtonElement>('.nav [data-go]').forEach((b) => {
      if (b.dataset.go === tela) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (tela === 'painel' || tela === 'agenda') void atualizarTurma();
    window.scrollTo({ top: 0 });
  }

  /** Avisa a biblioteca de quem são os exercícios e as práticas a mostrar. */
  function publicarContexto() {
    if (!conta) return;
    if (conta.tipo === 'professor') {
      opcoes.aoMudarContexto({ papel: 'professor', donoId: conta.id, contasResultados: [conta.id, ...idsTurma] });
    } else if (conta.professorId) {
      opcoes.aoMudarContexto({ papel: 'aluno-turma', donoId: conta.professorId, contasResultados: [conta.id] });
    } else {
      opcoes.aoMudarContexto({ papel: 'aluno-independente', donoId: conta.id, contasResultados: [conta.id] });
    }
  }

  function mostrarUsuario() {
    if (!conta) return;
    el('userEmail').textContent = conta.nome;
    el('userRole').textContent = conta.tipo === 'professor' ? 'Professor' : conta.professorId ? 'Aluno' : 'Aluno independente';
    el('userAvatar').textContent = iniciais(conta.nome);
    const papel = conta.tipo;
    document.querySelectorAll<HTMLElement>('[data-papel]').forEach((n) => (n.hidden = n.dataset.papel !== papel));
    document.querySelectorAll<HTMLElement>('[data-label-aluno]').forEach((n) => {
      n.dataset.labelProfessor ??= n.textContent ?? '';
      n.textContent = papel === 'aluno' ? (n.dataset.labelAluno ?? '') : n.dataset.labelProfessor;
    });
  }

  // ---------- Entrar / criar conta ----------

  function mostrarEntrada(modo: 'entrar' | 'criar') {
    formEntrar.hidden = modo !== 'entrar';
    formCriar.hidden = modo !== 'criar';
    status(el('loginStatus'), '');
    status(el('signupStatus'), '');
  }

  function atualizarCampoCodigo() {
    campoCodigo.hidden = new FormData(formCriar).get('role') !== 'aluno';
  }

  /** Lê o endereço: #entrar, #criar-conta, #criar-professor, #criar-aluno e ?codigo=XXXXXX. */
  function lerEndereco() {
    const hash = location.hash.slice(1);
    const codigo = new URLSearchParams(location.search).get('codigo') ?? '';
    if (codigo) el<HTMLInputElement>('signupCode').value = codigo.toUpperCase();
    const tipo = hash === 'criar-professor' ? 'professor' : hash === 'criar-aluno' || codigo ? 'aluno' : null;
    if (tipo) formCriar.querySelector<HTMLInputElement>(`input[name="role"][value="${tipo}"]`)!.checked = true;
    mostrarEntrada(hash.startsWith('criar') || codigo ? 'criar' : 'entrar');
    atualizarCampoCodigo();
  }

  formCriar.addEventListener('change', atualizarCampoCodigo);
  window.addEventListener('hashchange', () => {
    if (!conta) lerEndereco();
  });

  formEntrar.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const dados = new FormData(formEntrar);
    void enviando(formEntrar, async () => {
      try {
        abrirApp(await servidor.entrar(String(dados.get('email') ?? ''), String(dados.get('password') ?? '')));
      } catch (erro) {
        status(el('loginStatus'), mensagem(erro), 'erro');
      }
    });
  });

  formCriar.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const dados = new FormData(formCriar);
    const tipo = dados.get('role') === 'aluno' ? 'aluno' : 'professor';
    void enviando(formCriar, async () => {
      try {
        const nova = await servidor.cadastrar({
          tipo,
          nome: String(dados.get('name') ?? ''),
          email: String(dados.get('email') ?? ''),
          senha: String(dados.get('password') ?? ''),
          codigoTurma: tipo === 'aluno' ? String(dados.get('code') ?? '') : undefined,
        });
        abrirApp(nova);
      } catch (erro) {
        if (erro instanceof ConfirmeEmail) {
          // Conta criada, falta confirmar o e-mail: volta para "Entrar" já com o e-mail preenchido.
          mostrarEntrada('entrar');
          el<HTMLInputElement>('loginEmail').value = String(dados.get('email') ?? '');
          status(el('loginStatus'), erro.message, 'ok');
          return;
        }
        status(el('signupStatus'), mensagem(erro), 'erro');
      }
    });
  });

  function abrirApp(nova: Conta) {
    conta = nova;
    idsTurma = [];
    fichaAberta = null;
    el('studentDetail').hidden = true;
    formEntrar.reset();
    formCriar.reset();
    // Tira o código e o #criar do endereço, para não reaparecer ao sair.
    history.replaceState(null, '', location.pathname);
    mostrarUsuario();
    status(avisoTurma, '');
    status(avisoPerfil, '');
    status(avisoEntrarTurma, '');
    telaLogin.hidden = true;
    app.hidden = false;
    publicarContexto();
    if (conta.tipo === 'professor') {
      el('classCode').textContent = conta.codigoTurma ?? '—';
      irPara('painel');
    } else {
      void carregarPerfil();
      irPara('treino');
    }
  }

  async function sair() {
    if (telaAtual === 'afinador') opcoes.aoSairDoAfinador();
    telaAtual = null;
    conta = null;
    await servidor.sair();
    app.hidden = true;
    telaLogin.hidden = false;
    lerEndereco();
    window.scrollTo({ top: 0 });
  }

  // ---------- Professor: turma ----------

  async function atualizarTurma() {
    const prof = conta;
    if (prof?.tipo !== 'professor') return;
    let turma: Turma;
    try {
      turma = await servidor.turma(prof.id);
    } catch (erro) {
      status(avisoTurma, mensagem(erro), 'erro');
      return;
    }
    if (conta !== prof) return;
    const { alunos, convites } = turma;

    const novosIds = alunos.map((a) => a.id);
    const mudou = novosIds.join() !== idsTurma.join();
    idsTurma = novosIds;
    if (mudou) publicarContexto();
    agenda.mostrar(prof, turma);

    el('studentCount').textContent = String(alunos.length);
    void carregarResultados([prof.id, ...idsTurma]).then(() => {
      if (conta === prof) el('practiceCount').textContent = String(totalPraticas([prof.id, ...idsTurma]));
    });
    contarExercicios(prof.id)
      .then((n) => (el('exerciseCount').textContent = String(n)))
      .catch(() => (el('exerciseCount').textContent = '—'));

    desenharFicha(turma);
    lista.replaceChildren();
    if (!alunos.length && !convites.length) {
      const vazio = criar('div', 'empty');
      vazio.append(
        criar('b', undefined, 'Nenhum aluno ainda'),
        criar('span', undefined, 'Convide pelo e-mail acima ou envie o link de convite com o código da turma.'),
      );
      lista.append(vazio);
      return;
    }
    const cabecalho = criar('div', 'table-row head');
    cabecalho.append(criar('span', undefined, 'Nome'), criar('span', undefined, 'E-mail'), criar('span', undefined, 'Aulas'), criar('span'));
    lista.append(cabecalho);

    const linha = (nome: string, email: string, ativo: boolean, acao: string, aoClicar: () => Promise<void>) => {
      const row = criar('div', fichaAberta === email ? 'table-row selected' : 'table-row');
      const celNome = criar('button', 'name-btn');
      celNome.type = 'button';
      celNome.setAttribute('aria-label', `Abrir ficha de ${nome}`);
      celNome.append(criar('span', 'mini-avatar', iniciais(nome)), criar('span', undefined, nome));
      celNome.addEventListener('click', () => {
        fichaAberta = email;
        void atualizarTurma().then(() => el('studentDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      });
      const celEmail = criar('span', 'mail');
      const etiqueta = criar('span', ativo ? 'status-tag ok' : 'status-tag', ativo ? 'Ativo' : 'Pendente');
      etiqueta.title = ativo ? 'Já tem conta e está na turma' : 'Convidado: ainda não criou a conta';
      celEmail.append(criar('span', 'mail-text', email), etiqueta);
      const celAulas = criar('span', 'classes', resumoAulas(turma.aulas.filter((a) => a.alunoEmail === email)));
      const botao = criar('button', 'link-danger', acao);
      botao.type = 'button';
      botao.setAttribute('aria-label', `${acao}: ${nome}`);
      botao.addEventListener('click', async () => {
        try {
          await aoClicar();
        } catch (erro) {
          status(avisoTurma, mensagem(erro), 'erro');
        }
        void atualizarTurma();
      });
      row.append(celNome, celEmail, celAulas, botao);
      lista.append(row);
    };
    for (const a of alunos) {
      linha(a.nome, a.email, true, 'Remover', async () => {
        if (!window.confirm(`Remover ${a.nome} da turma? A conta continua existindo, mas sem acesso aos seus exercícios. Os horários e a ficha são apagados.`)) return;
        await servidor.removerDaTurma(prof.id, a.id);
        status(avisoTurma, `${a.nome} saiu da turma.`);
      });
    }
    for (const c of convites) {
      linha(c.nome, c.email, false, 'Cancelar', async () => {
        if (!window.confirm(`Cancelar o convite de ${c.nome}? Os horários e a ficha são apagados.`)) return;
        await servidor.cancelarConvite(prof.id, c.id);
        status(avisoTurma, `Convite de ${c.nome} cancelado.`);
      });
    }
  }

  /** Ficha do aluno escolhido na lista: contato, anotações e horários. */
  function desenharFicha(turma: Turma) {
    const painel = el('studentDetail');
    const prof = conta;
    const email = fichaAberta;
    const contaAluno = turma.alunos.find((a) => a.email === email);
    const convite = turma.convites.find((c) => c.email === email);
    if (!prof || !email || (!contaAluno && !convite)) {
      fichaAberta = null;
      painel.hidden = true;
      return;
    }
    const nome = contaAluno?.nome ?? convite!.nome;
    const ficha = turma.fichas.find((f) => f.alunoEmail === email);
    painel.replaceChildren();
    painel.hidden = false;

    const cab = criar('div', 'detail-head');
    const texto = criar('div');
    const titulo = criar('h2', undefined, nome);
    titulo.id = 'detailName';
    texto.append(titulo, criar('small', undefined, email));
    const fechar = criar('button', 'icon-btn');
    fechar.type = 'button';
    fechar.setAttribute('aria-label', 'Fechar ficha');
    fechar.innerHTML = '<svg><use href="#i-fechar"/></svg>';
    fechar.addEventListener('click', () => {
      fichaAberta = null;
      void atualizarTurma();
    });
    cab.append(criar('span', 'mini-avatar', iniciais(nome)), texto, criar('span', contaAluno ? 'status-tag ok' : 'status-tag', contaAluno ? 'Ativo' : 'Aguardando cadastro'), fechar);

    // Dados que o aluno preencheu no perfil (só quem já tem conta).
    const perfil = contaAluno && (contaAluno.voz || contaAluno.objetivo) ? criar('p', 'muted small') : null;
    if (perfil && contaAluno) perfil.textContent = [contaAluno.voz && `Voz: ${contaAluno.voz}`, contaAluno.objetivo && `Objetivo: ${contaAluno.objetivo}`].filter(Boolean).join(' · ');

    const form = criar('form', 'form-grid');
    form.innerHTML = `
      <div class="field"><label for="detailPhone">WhatsApp</label><input id="detailPhone" name="phone" type="tel" maxlength="30" placeholder="(11) 90000-0000"></div>
      <div class="field span-2"><label for="detailNotes">Anotações <span class="opt">só você vê</span></label><textarea id="detailNotes" name="notes" rows="3" maxlength="1000" placeholder="Ex.: repertório, pontos a trabalhar, forma de pagamento"></textarea></div>
      <div class="form-actions span-2"><p class="form-status" role="status"></p><button class="btn secondary" type="submit">Salvar ficha</button></div>`;
    form.querySelector<HTMLInputElement>('#detailPhone')!.value = ficha?.telefone ?? '';
    form.querySelector<HTMLTextAreaElement>('#detailNotes')!.value = ficha?.observacoes ?? '';
    const avisoFicha = form.querySelector<HTMLElement>('.form-status')!;
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const dados = new FormData(form);
      void enviando(form, async () => {
        try {
          await servidor.salvarFicha(prof.id, email, { telefone: String(dados.get('phone') ?? ''), observacoes: String(dados.get('notes') ?? '') });
          status(avisoFicha, 'Ficha salva.', 'ok');
        } catch (erro) {
          status(avisoFicha, mensagem(erro), 'erro');
        }
      });
    });

    const sub = criar('div', 'detail-sub');
    const adicionar = criar('button', 'btn secondary sm', '+ Horário');
    adicionar.type = 'button';
    adicionar.addEventListener('click', () => agenda.abrirForm({ email }));
    sub.append(criar('span', undefined, 'Horários das aulas'), adicionar);
    const aulas = criar('div', 'today-list');
    const doAluno = turma.aulas.filter((a) => a.alunoEmail === email);
    for (const a of doAluno) aulas.append(linhaAula(a, { aoEditar: () => agenda.abrirForm({ aula: a }) }));
    if (!doAluno.length) aulas.append(criar('p', 'muted small', 'Nenhum horário marcado.'));

    painel.append(cab, ...(perfil ? [perfil] : []), form, sub, aulas);
  }

  formAluno.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const prof = conta;
    if (prof?.tipo !== 'professor') return;
    const dados = new FormData(formAluno);
    const nome = String(dados.get('name') ?? '').trim();
    void enviando(formAluno, async () => {
      try {
        await servidor.convidarAluno(prof.id, nome, String(dados.get('email') ?? ''), String(dados.get('phone') ?? ''));
        formAluno.reset();
        status(avisoTurma, `Convite criado para ${nome}. Quando a conta for criada com esse e-mail, entra na sua turma.`, 'ok');
        await atualizarTurma();
      } catch (erro) {
        status(avisoTurma, mensagem(erro), 'erro');
      }
    });
  });

  el('copyInvite').addEventListener('click', async () => {
    if (!conta?.codigoTurma) return;
    const link = `${location.origin}${location.pathname}?codigo=${conta.codigoTurma}#criar-aluno`;
    try {
      await navigator.clipboard.writeText(link);
      status(avisoTurma, 'Link copiado. Envie para o aluno: ele cria a conta já com o código da turma.', 'ok');
    } catch {
      status(avisoTurma, `Link de convite: ${link}`);
    }
  });

  // ---------- Aluno: perfil e professor ----------

  async function carregarPerfil() {
    const aluno = conta;
    if (aluno?.tipo !== 'aluno') return;
    const campos = formPerfil.elements;
    (campos.namedItem('name') as HTMLInputElement).value = aluno.nome;
    (campos.namedItem('email') as HTMLInputElement).value = aluno.email;
    (campos.namedItem('voice') as HTMLSelectElement).value = aluno.voz;
    (campos.namedItem('goal') as HTMLTextAreaElement).value = aluno.objetivo;

    let prof: Conta | null, convites: Awaited<ReturnType<typeof servidor.convitesPara>>, aulas: Awaited<ReturnType<typeof servidor.aulasDoAluno>>;
    try {
      [prof, convites, aulas] = await Promise.all([servidor.professorDe(aluno), servidor.convitesPara(aluno), servidor.aulasDoAluno(aluno)]);
    } catch (erro) {
      status(avisoEntrarTurma, mensagem(erro), 'erro');
      return;
    }
    if (conta !== aluno) return;
    const minhasAulas = el('myClasses');
    minhasAulas.replaceChildren(...aulas.map((a) => linhaAula(a)));
    if (!aulas.length) minhasAulas.append(criar('p', 'muted small', 'Seu professor ainda não marcou horários.'));
    el('myClassesPanel').hidden = !prof;
    const info = el('teacherInfo');
    info.replaceChildren();
    formTurma.hidden = !!prof;
    el('practiceLead').textContent = prof ? 'Os exercícios do seu professor.' : 'Os exercícios que você cadastrou.';

    if (prof) {
      el('teacherLead').textContent = 'Você pratica os exercícios desta turma.';
      const cartao = criar('div', 'teacher-card');
      const texto = criar('div');
      texto.append(criar('b', undefined, prof.nome), criar('small', undefined, prof.email));
      const sairBtn = criar('button', 'link-danger', 'Sair da turma');
      sairBtn.type = 'button';
      sairBtn.addEventListener('click', async () => {
        if (!window.confirm(`Sair da turma de ${prof.nome}? Você deixa de ver os exercícios dessa turma.`)) return;
        atualizarConta(await servidor.sairDaTurma(aluno.id));
        status(avisoEntrarTurma, 'Você saiu da turma.');
      });
      cartao.append(criar('span', 'mini-avatar', iniciais(prof.nome)), texto, sairBtn);
      info.append(cartao);
    } else {
      el('teacherLead').textContent = 'Você estuda por conta própria. Tem professor? Digite o código da turma.';
    }

    if (convites.length) {
      const caixa = criar('div', 'invite-list');
      for (const c of convites) {
        const row = criar('div', 'invite-row');
        row.append(criar('span', undefined, `${c.professorNome} convidou você para a turma.`));
        const aceitar = criar('button', 'btn primary sm', 'Aceitar');
        aceitar.type = 'button';
        aceitar.addEventListener('click', async () => {
          try {
            atualizarConta(await servidor.aceitarConvite(aluno.id, c.id));
            status(avisoEntrarTurma, `Agora você está na turma de ${c.professorNome}.`, 'ok');
          } catch (erro) {
            status(avisoEntrarTurma, mensagem(erro), 'erro');
          }
        });
        row.append(aceitar);
        caixa.append(row);
      }
      info.append(caixa);
    }
  }

  /** A conta mudou (perfil, turma): redesenha o que depende dela. */
  function atualizarConta(nova: Conta) {
    const mudouTurma = nova.professorId !== conta?.professorId;
    conta = nova;
    mostrarUsuario();
    if (mudouTurma) publicarContexto();
    void carregarPerfil();
  }

  formTurma.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const aluno = conta;
    if (aluno?.tipo !== 'aluno') return;
    const codigo = String(new FormData(formTurma).get('code') ?? '');
    void enviando(formTurma, async () => {
      try {
        const nova = await servidor.entrarNaTurma(aluno.id, codigo);
        formTurma.reset();
        atualizarConta(nova);
        const prof = await servidor.professorDe(nova);
        status(avisoEntrarTurma, `Agora você está na turma de ${prof?.nome ?? 'seu professor'}.`, 'ok');
      } catch (erro) {
        status(avisoEntrarTurma, mensagem(erro), 'erro');
      }
    });
  });

  formPerfil.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const aluno = conta;
    if (!aluno) return;
    const dados = new FormData(formPerfil);
    void enviando(formPerfil, async () => {
      try {
        atualizarConta(
          await servidor.atualizarPerfil(aluno.id, {
            nome: String(dados.get('name') ?? ''),
            voz: String(dados.get('voice') ?? ''),
            objetivo: String(dados.get('goal') ?? ''),
          }),
        );
        status(avisoPerfil, 'Perfil salvo.', 'ok');
      } catch (erro) {
        status(avisoPerfil, mensagem(erro), 'erro');
      }
    });
  });

  // ---------- Cliques gerais ----------

  document.addEventListener('click', (evento) => {
    const alvo = (evento.target as Element | null)?.closest<HTMLElement>('[data-go]');
    if (alvo && app.contains(alvo)) {
      const tela = alvo.dataset.go as Tela;
      if (TELAS.includes(tela)) irPara(tela);
    }
    if ((evento.target as Element | null)?.closest('[data-logout]')) void sair();
  });

  // Quem já entrou antes continua logado.
  telaLogin.hidden = true;
  app.hidden = true;
  void servidor
    .contaAtual()
    .catch(() => null)
    .then((salva) => {
      if (salva) abrirApp(salva);
      else {
        telaLogin.hidden = false;
        lerEndereco();
      }
    });

  return { irPara, conta: () => conta };
}
