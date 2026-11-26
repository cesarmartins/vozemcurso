// Versão do servidor que guarda as contas neste navegador. Serve para desenvolver e
// demonstrar o sistema; não protege nada de verdade (quem usa o navegador vê os dados).
// Em produção, troque por uma versão que fale com o banco (veja supabase/schema.sql).

import { conflito, descrever, ordenar, validarHorario } from '../agenda/horarios';
import { ErroConta, type Aula, type Conta, type Convite, type FichaAluno, type NovaConta, type Servidor, type Turma } from './tipos';

export interface Armazenamento {
  ler(chave: string): string | null;
  gravar(chave: string, valor: string): void;
  apagar(chave: string): void;
}

interface ContaGuardada extends Conta {
  senhaHash: string;
  sal: string;
}

const CHAVE_CONTAS = 'afinador-vocal-contas';
const CHAVE_CONVITES = 'afinador-vocal-convites';
const CHAVE_SESSAO = 'afinador-vocal-sessao';
const CHAVE_FICHAS = 'afinador-vocal-fichas';
const CHAVE_AULAS = 'afinador-vocal-aulas';

/** Letras e números sem os que se confundem (0/O, 1/I/L). */
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TAMANHO_CODIGO = 6;
export const SENHA_MIN = 8;

export const normalizarEmail = (email: string) => email.trim().toLowerCase();
export const normalizarCodigo = (codigo: string) => codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
const emailValido = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function aleatorio(bytes: number): Uint8Array {
  const b = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(b);
  return b;
}
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const novoId = () => globalThis.crypto.randomUUID?.() ?? hex(aleatorio(16));

async function hashSenha(senha: string, sal: string): Promise<string> {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(sal), iterations: 100_000 },
    chave,
    256,
  );
  return hex(new Uint8Array(bits));
}

function publica(c: ContaGuardada): Conta {
  const { senhaHash: _h, sal: _s, ...conta } = c;
  return { ...conta };
}

export function criarServidorLocal(armazenamento: Armazenamento): Servidor {
  function lerLista<T>(chave: string): T[] {
    try {
      const valor: unknown = JSON.parse(armazenamento.ler(chave) ?? '[]');
      return Array.isArray(valor) ? (valor as T[]) : [];
    } catch {
      return [];
    }
  }
  function gravarLista<T>(chave: string, lista: T[]) {
    try {
      armazenamento.gravar(chave, JSON.stringify(lista));
    } catch {
      throw new ErroConta('Não consegui salvar neste navegador. Verifique se o armazenamento está liberado.');
    }
  }
  const contas = () => lerLista<ContaGuardada>(CHAVE_CONTAS);
  const convites = () => lerLista<Convite>(CHAVE_CONVITES);
  const fichas = () => lerLista<FichaAluno>(CHAVE_FICHAS);
  const aulas = () => lerLista<Aula>(CHAVE_AULAS);

  /** E-mails dos alunos do professor: os que têm conta e os convidados. */
  function emailsDaTurma(professorId: string): Set<string> {
    return new Set([
      ...contas().filter((c) => c.tipo === 'aluno' && c.professorId === professorId).map((c) => c.email),
      ...convites().filter((c) => c.professorId === professorId).map((c) => c.email),
    ]);
  }
  /** Aluno saiu da turma: some a ficha e os horários dele com esse professor. */
  function esquecerAluno(professorId: string, email: string) {
    gravarLista(CHAVE_FICHAS, fichas().filter((f) => !(f.professorId === professorId && f.alunoEmail === email)));
    gravarLista(CHAVE_AULAS, aulas().filter((a) => !(a.professorId === professorId && a.alunoEmail === email)));
  }
  function gravarFicha(ficha: FichaAluno) {
    const outras = fichas().filter((f) => !(f.professorId === ficha.professorId && f.alunoEmail === ficha.alunoEmail));
    gravarLista(CHAVE_FICHAS, [...outras, ficha]);
  }

  function buscar(id: string): ContaGuardada {
    const conta = contas().find((c) => c.id === id);
    if (!conta) throw new ErroConta('Conta não encontrada.');
    return conta;
  }
  function salvar(conta: ContaGuardada) {
    gravarLista(CHAVE_CONTAS, contas().map((c) => (c.id === conta.id ? conta : c)));
  }
  function professor(id: string): ContaGuardada {
    const conta = buscar(id);
    if (conta.tipo !== 'professor') throw new ErroConta('Só professores podem fazer isso.');
    return conta;
  }
  function aluno(id: string): ContaGuardada {
    const conta = buscar(id);
    if (conta.tipo !== 'aluno') throw new ErroConta('Só alunos podem fazer isso.');
    return conta;
  }
  function novoCodigo(): string {
    const usados = new Set(contas().map((c) => c.codigoTurma));
    for (;;) {
      const codigo = Array.from(aleatorio(TAMANHO_CODIGO), (b) => ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]).join('');
      if (!usados.has(codigo)) return codigo;
    }
  }
  function professorPorCodigo(codigo: string): ContaGuardada {
    const limpo = normalizarCodigo(codigo);
    const prof = contas().find((c) => c.tipo === 'professor' && c.codigoTurma === limpo);
    if (!prof) throw new ErroConta('Código da turma não encontrado. Confira com seu professor.');
    return prof;
  }
  /** Coloca o aluno na turma e apaga os convites dele, que já não servem. */
  function vincular(alunoConta: ContaGuardada, professorId: string): ContaGuardada {
    if (alunoConta.professorId && alunoConta.professorId !== professorId) esquecerAluno(alunoConta.professorId, alunoConta.email);
    const atualizada = { ...alunoConta, professorId };
    salvar(atualizada);
    gravarLista(CHAVE_CONVITES, convites().filter((c) => c.email !== alunoConta.email));
    return atualizada;
  }

  return {
    async contaAtual() {
      const id = armazenamento.ler(CHAVE_SESSAO);
      const conta = id ? contas().find((c) => c.id === id) : undefined;
      return conta ? publica(conta) : null;
    },

    async cadastrar({ tipo, nome, email, senha, codigoTurma }: NovaConta) {
      const nomeLimpo = nome.trim();
      const emailLimpo = normalizarEmail(email);
      if (!nomeLimpo) throw new ErroConta('Informe seu nome.');
      if (!emailValido(emailLimpo)) throw new ErroConta('Informe um e-mail válido.');
      if (senha.length < SENHA_MIN) throw new ErroConta(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
      if (contas().some((c) => c.email === emailLimpo)) throw new ErroConta('Já existe uma conta com esse e-mail. Use “Entrar”.');

      // Aluno: com código entra na turma do professor; sem código, mas convidado pelo e-mail, também.
      let professorId: string | null = null;
      if (tipo === 'aluno') {
        if (codigoTurma?.trim()) professorId = professorPorCodigo(codigoTurma).id;
        else professorId = convites().find((c) => c.email === emailLimpo)?.professorId ?? null;
      }

      const sal = hex(aleatorio(16));
      const conta: ContaGuardada = {
        id: novoId(),
        tipo,
        nome: nomeLimpo,
        email: emailLimpo,
        professorId,
        codigoTurma: tipo === 'professor' ? novoCodigo() : null,
        voz: '',
        objetivo: '',
        criadoEm: Date.now(),
        senhaHash: await hashSenha(senha, sal),
        sal,
      };
      gravarLista(CHAVE_CONTAS, [...contas(), conta]);
      if (professorId) vincular(conta, professorId);
      armazenamento.gravar(CHAVE_SESSAO, conta.id);
      return publica(buscar(conta.id));
    },

    async entrar(email, senha) {
      const conta = contas().find((c) => c.email === normalizarEmail(email));
      // Mesma mensagem para e-mail e senha errados: não revela quem tem conta.
      if (!conta || (await hashSenha(senha, conta.sal)) !== conta.senhaHash) throw new ErroConta('E-mail ou senha incorretos.');
      armazenamento.gravar(CHAVE_SESSAO, conta.id);
      return publica(conta);
    },

    async sair() {
      armazenamento.apagar(CHAVE_SESSAO);
    },

    async atualizarPerfil(id, { nome, voz, objetivo }) {
      const conta = buscar(id);
      if (!nome.trim()) throw new ErroConta('Informe seu nome.');
      const atualizada = { ...conta, nome: nome.trim(), voz, objetivo: objetivo.trim() };
      salvar(atualizada);
      return publica(atualizada);
    },

    async turma(professorId): Promise<Turma> {
      professor(professorId);
      return {
        alunos: contas()
          .filter((c) => c.tipo === 'aluno' && c.professorId === professorId)
          .map(publica)
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        convites: convites().filter((c) => c.professorId === professorId),
        fichas: fichas().filter((f) => f.professorId === professorId),
        aulas: ordenar(aulas().filter((a) => a.professorId === professorId)),
      };
    },

    async convidarAluno(professorId, nome, email, telefone = '') {
      professor(professorId);
      const nomeLimpo = nome.trim();
      const emailLimpo = normalizarEmail(email);
      if (!nomeLimpo) throw new ErroConta('Informe o nome do aluno.');
      if (!emailValido(emailLimpo)) throw new ErroConta('Informe um e-mail válido.');
      const existente = contas().find((c) => c.email === emailLimpo);
      if (existente?.tipo === 'professor') throw new ErroConta('Esse e-mail é de uma conta de professor.');
      if (existente?.professorId === professorId) throw new ErroConta('Esse aluno já está na sua turma.');
      if (convites().some((c) => c.professorId === professorId && c.email === emailLimpo)) {
        throw new ErroConta('Esse e-mail já foi convidado e está aguardando.');
      }
      const convite: Convite = { id: novoId(), professorId, nome: nomeLimpo, email: emailLimpo, criadoEm: Date.now() };
      gravarLista(CHAVE_CONVITES, [...convites(), convite]);
      if (telefone.trim()) gravarFicha({ professorId, alunoEmail: emailLimpo, telefone: telefone.trim(), observacoes: '' });
      return convite;
    },

    async salvarFicha(professorId, alunoEmail, { telefone, observacoes }) {
      professor(professorId);
      const email = normalizarEmail(alunoEmail);
      if (!emailsDaTurma(professorId).has(email)) throw new ErroConta('Esse aluno não é da sua turma.');
      const ficha: FichaAluno = { professorId, alunoEmail: email, telefone: telefone.trim(), observacoes: observacoes.trim() };
      gravarFicha(ficha);
      return ficha;
    },

    async salvarAula(professorId, dados) {
      professor(professorId);
      const email = normalizarEmail(dados.alunoEmail);
      if (!emailsDaTurma(professorId).has(email)) throw new ErroConta('Escolha um aluno da sua turma.');
      const erro = validarHorario(dados);
      if (erro) throw new ErroConta(erro);
      const todas = aulas();
      const antiga = dados.id ? todas.find((a) => a.id === dados.id && a.professorId === professorId) : undefined;
      if (dados.id && !antiga) throw new ErroConta('Essa aula não existe mais.');
      const aula: Aula = {
        id: antiga?.id ?? novoId(),
        professorId,
        alunoEmail: email,
        dia: dados.dia,
        inicio: dados.inicio,
        duracao: dados.duracao,
        modalidade: dados.modalidade === 'online' ? 'online' : 'presencial',
        local: dados.local.trim(),
        criadoEm: antiga?.criadoEm ?? Date.now(),
      };
      const choque = conflito(aula, todas.filter((a) => a.professorId === professorId));
      if (choque) {
        const nome = contas().find((c) => c.email === choque.alunoEmail)?.nome ?? convites().find((c) => c.email === choque.alunoEmail)?.nome ?? choque.alunoEmail;
        throw new ErroConta(`Esse horário bate com a aula de ${nome} (${descrever(choque)}).`);
      }
      gravarLista(CHAVE_AULAS, antiga ? todas.map((a) => (a.id === aula.id ? aula : a)) : [...todas, aula]);
      return aula;
    },

    async excluirAula(professorId, aulaId) {
      gravarLista(CHAVE_AULAS, aulas().filter((a) => !(a.id === aulaId && a.professorId === professorId)));
    },

    async cancelarConvite(professorId, conviteId) {
      const convite = convites().find((c) => c.id === conviteId && c.professorId === professorId);
      if (convite && !contas().some((c) => c.email === convite.email && c.professorId === professorId)) esquecerAluno(professorId, convite.email);
      gravarLista(CHAVE_CONVITES, convites().filter((c) => !(c.id === conviteId && c.professorId === professorId)));
    },

    async removerDaTurma(professorId, alunoId) {
      const conta = aluno(alunoId);
      if (conta.professorId !== professorId) throw new ErroConta('Esse aluno não é da sua turma.');
      salvar({ ...conta, professorId: null });
      esquecerAluno(professorId, conta.email);
    },

    async professorDe(alunoConta) {
      if (!alunoConta.professorId) return null;
      const prof = contas().find((c) => c.id === alunoConta.professorId);
      return prof ? publica(prof) : null;
    },

    async aulasDoAluno(alunoConta) {
      const atual = contas().find((c) => c.id === alunoConta.id);
      if (!atual?.professorId) return [];
      return ordenar(aulas().filter((a) => a.professorId === atual.professorId && a.alunoEmail === atual.email));
    },

    async convitesPara(alunoConta) {
      const todas = contas();
      return convites()
        .filter((c) => c.email === alunoConta.email && c.professorId !== alunoConta.professorId)
        .map((c) => ({ ...c, professorNome: todas.find((p) => p.id === c.professorId)?.nome ?? 'Professor' }));
    },

    async aceitarConvite(alunoId, conviteId) {
      const conta = aluno(alunoId);
      const convite = convites().find((c) => c.id === conviteId && c.email === conta.email);
      if (!convite) throw new ErroConta('Esse convite não existe mais.');
      return publica(vincular(conta, convite.professorId));
    },

    async entrarNaTurma(alunoId, codigo) {
      const conta = aluno(alunoId);
      const prof = professorPorCodigo(codigo);
      if (conta.professorId === prof.id) throw new ErroConta('Você já está nessa turma.');
      return publica(vincular(conta, prof.id));
    },

    async sairDaTurma(alunoId) {
      const conta = aluno(alunoId);
      if (conta.professorId) esquecerAluno(conta.professorId, conta.email);
      const atualizada = { ...conta, professorId: null };
      salvar(atualizada);
      return publica(atualizada);
    },
  };
}

/** Armazenamento do navegador (localStorage), tolerante a navegação privada. */
export const armazenamentoNavegador: Armazenamento = {
  ler: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  gravar: (k, v) => localStorage.setItem(k, v),
  apagar: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // nada a apagar
    }
  },
};
