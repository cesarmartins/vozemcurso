import { beforeEach, describe, expect, it } from 'vitest';
import { criarServidorLocal, type Armazenamento } from './local';
import type { Servidor } from './tipos';

function memoria(): Armazenamento {
  const dados = new Map<string, string>();
  return { ler: (k) => dados.get(k) ?? null, gravar: (k, v) => void dados.set(k, v), apagar: (k) => void dados.delete(k) };
}

let s: Servidor;
beforeEach(() => {
  s = criarServidorLocal(memoria());
});

const professor = (email = 'ana@escola.com') => s.cadastrar({ tipo: 'professor', nome: 'Ana', email, senha: 'senha-forte' });

describe('contas', () => {
  it('cadastra, mantém a sessão e entra só com a senha certa', async () => {
    const ana = await professor();
    expect(ana.codigoTurma).toMatch(/^[A-Z2-9]{6}$/);
    expect(await s.contaAtual()).toMatchObject({ id: ana.id });
    expect(JSON.stringify(ana)).not.toContain('senha');
    await s.sair();
    expect(await s.contaAtual()).toBeNull();
    await expect(s.entrar('ana@escola.com', 'errada123')).rejects.toThrow('E-mail ou senha incorretos');
    expect((await s.entrar(' ANA@escola.com ', 'senha-forte')).id).toBe(ana.id);
  });

  it('não deixa repetir e-mail nem senha curta', async () => {
    await professor();
    await expect(professor()).rejects.toThrow('Já existe');
    await expect(s.cadastrar({ tipo: 'aluno', nome: 'Bia', email: 'bia@x.com', senha: '123' })).rejects.toThrow('8 caracteres');
  });

  it('aluno sem código estuda sozinho; com código entra na turma', async () => {
    const ana = await professor();
    const solo = await s.cadastrar({ tipo: 'aluno', nome: 'Caio', email: 'caio@x.com', senha: 'senha-forte' });
    expect(solo.professorId).toBeNull();
    const bia = await s.cadastrar({ tipo: 'aluno', nome: 'Bia', email: 'bia@x.com', senha: 'senha-forte', codigoTurma: ana.codigoTurma!.toLowerCase() });
    expect(bia.professorId).toBe(ana.id);
    await expect(s.cadastrar({ tipo: 'aluno', nome: 'Duda', email: 'duda@x.com', senha: 'senha-forte', codigoTurma: 'ZZZZZZ' })).rejects.toThrow('não encontrado');
  });

  it('cada professor vê só os próprios alunos', async () => {
    const ana = await professor();
    const beto = await professor('beto@escola.com');
    await s.cadastrar({ tipo: 'aluno', nome: 'Bia', email: 'bia@x.com', senha: 'senha-forte', codigoTurma: ana.codigoTurma! });
    await s.cadastrar({ tipo: 'aluno', nome: 'Caio', email: 'caio@x.com', senha: 'senha-forte', codigoTurma: beto.codigoTurma! });
    expect((await s.turma(ana.id)).alunos.map((a) => a.nome)).toEqual(['Bia']);
    expect((await s.turma(beto.id)).alunos.map((a) => a.nome)).toEqual(['Caio']);
  });

  it('convite por e-mail: vincula no cadastro ou ao aceitar', async () => {
    const ana = await professor();
    await s.convidarAluno(ana.id, 'Bia', 'Bia@x.com');
    expect((await s.turma(ana.id)).convites).toHaveLength(1);
    const bia = await s.cadastrar({ tipo: 'aluno', nome: 'Bia', email: 'bia@x.com', senha: 'senha-forte' });
    expect(bia.professorId).toBe(ana.id);
    expect((await s.turma(ana.id)).convites).toHaveLength(0);

    // Aluno que já tinha conta independente precisa aceitar.
    const caio = await s.cadastrar({ tipo: 'aluno', nome: 'Caio', email: 'caio@x.com', senha: 'senha-forte' });
    const convite = await s.convidarAluno(ana.id, 'Caio', 'caio@x.com');
    expect((await s.turma(ana.id)).alunos.map((a) => a.nome)).toEqual(['Bia']);
    const pendentes = await s.convitesPara(caio);
    expect(pendentes[0]).toMatchObject({ id: convite.id, professorNome: 'Ana' });
    expect((await s.aceitarConvite(caio.id, convite.id)).professorId).toBe(ana.id);
  });

  it('remover da turma deixa o aluno independente, com a conta intacta', async () => {
    const ana = await professor();
    const bia = await s.cadastrar({ tipo: 'aluno', nome: 'Bia', email: 'bia@x.com', senha: 'senha-forte', codigoTurma: ana.codigoTurma! });
    const beto = await professor('beto@escola.com');
    await expect(s.removerDaTurma(beto.id, bia.id)).rejects.toThrow('não é da sua turma');
    await s.removerDaTurma(ana.id, bia.id);
    expect((await s.turma(ana.id)).alunos).toHaveLength(0);
    expect((await s.entrar('bia@x.com', 'senha-forte')).professorId).toBeNull();
  });
});

describe('ficha e aulas', () => {
  it('marca aulas, recusa conflito e o aluno vê as dele', async () => {
    const ana = await professor();
    const bia = await s.cadastrar({ tipo: 'aluno', nome: 'Bia', email: 'bia@x.com', senha: 'senha-forte', codigoTurma: ana.codigoTurma! });
    await s.convidarAluno(ana.id, 'Caio', 'caio@x.com', '(11) 99999-0000');
    const base = { dia: 2, duracao: 60, modalidade: 'presencial' as const, local: '' };

    const aulaBia = await s.salvarAula(ana.id, { ...base, alunoEmail: 'bia@x.com', inicio: '14:00' });
    await expect(s.salvarAula(ana.id, { ...base, alunoEmail: 'caio@x.com', inicio: '14:30' })).rejects.toThrow('bate com a aula de Bia (Ter 14:00–15:00)');
    await s.salvarAula(ana.id, { ...base, alunoEmail: 'caio@x.com', inicio: '15:00' }); // encosta, não conflita
    await expect(s.salvarAula(ana.id, { ...base, alunoEmail: 'zeca@x.com', inicio: '09:00' })).rejects.toThrow('aluno da sua turma');

    // Editar a própria aula não conflita com ela mesma.
    await s.salvarAula(ana.id, { ...aulaBia, inicio: '13:30' });
    const turma = await s.turma(ana.id);
    expect(turma.aulas.map((a) => `${a.alunoEmail} ${a.inicio}`)).toEqual(['bia@x.com 13:30', 'caio@x.com 15:00']);
    expect(turma.fichas[0]).toMatchObject({ alunoEmail: 'caio@x.com', telefone: '(11) 99999-0000' });
    expect((await s.aulasDoAluno(bia)).map((a) => a.inicio)).toEqual(['13:30']);
  });

  it('outro professor não mexe na agenda; sair da turma apaga os horários', async () => {
    const ana = await professor();
    const beto = await professor('beto@escola.com');
    const bia = await s.cadastrar({ tipo: 'aluno', nome: 'Bia', email: 'bia@x.com', senha: 'senha-forte', codigoTurma: ana.codigoTurma! });
    const aula = await s.salvarAula(ana.id, { alunoEmail: 'bia@x.com', dia: 1, inicio: '10:00', duracao: 50, modalidade: 'online', local: '' });
    await expect(s.salvarAula(beto.id, { ...aula })).rejects.toThrow();
    await s.excluirAula(beto.id, aula.id);
    expect((await s.turma(ana.id)).aulas).toHaveLength(1);
    await s.salvarFicha(ana.id, 'bia@x.com', { telefone: '', observacoes: 'Trabalhar agudos' });

    await s.sairDaTurma(bia.id);
    const turma = await s.turma(ana.id);
    expect(turma.aulas).toHaveLength(0);
    expect(turma.fichas).toHaveLength(0);
    expect(await s.aulasDoAluno(bia)).toEqual([]);
  });
});
