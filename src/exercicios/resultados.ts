// Histórico de práticas: de cada aluno, em cada exercício. Guardado neste navegador por enquanto;
// em produção vira a tabela "resultados" do banco, que o professor consulta para a turma toda.

export interface ResultadoPratica {
  data: number;
  acertos: number;
  avaliadas: number;
  desvioMedio: number;
}

const CHAVE = 'afinador-vocal-resultados-v2';
const MAX_POR_EXERCICIO = 30;

/** contaId → exercicioId → práticas */
type Historico = Record<string, Record<string, ResultadoPratica[]>>;

function ler(): Historico {
  try {
    const valor: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? '{}');
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Historico) : {};
  } catch {
    return {};
  }
}

function gravar(todos: Historico): boolean {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(todos));
    return true;
  } catch {
    return false;
  }
}

/** Práticas de um exercício feitas por estas contas, da mais antiga para a mais recente. */
export function resultadosDe(idExercicio: string, contas: readonly string[]): ResultadoPratica[] {
  const todos = ler();
  return contas
    .flatMap((id) => todos[id]?.[idExercicio] ?? [])
    .filter((r) => r && typeof r.data === 'number')
    .sort((a, b) => a.data - b.data);
}

export function salvarResultado(contaId: string, idExercicio: string, r: ResultadoPratica): boolean {
  const todos = ler();
  const daConta = (todos[contaId] ??= {});
  daConta[idExercicio] = [...(daConta[idExercicio] ?? []), r].slice(-MAX_POR_EXERCICIO);
  return gravar(todos);
}

/** Apaga o histórico de um exercício removido da biblioteca, de todos os alunos. */
export function apagarResultados(idExercicio: string) {
  const todos = ler();
  for (const daConta of Object.values(todos)) delete daConta[idExercicio];
  gravar(todos);
}

/** "34 de 52 notas · 18 cents · 23/11" */
export function resumir(r: ResultadoPratica): string {
  const pct = r.avaliadas ? Math.round((r.acertos / r.avaliadas) * 100) : 0;
  const data = new Date(r.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${pct}% (${r.acertos} de ${r.avaliadas} notas) · ${Math.round(r.desvioMedio)} cents · ${data}`;
}

/** Quantas práticas estas contas registraram, somando todos os exercícios. */
export function totalPraticas(contas: readonly string[]): number {
  const todos = ler();
  return contas.reduce((soma, id) => soma + Object.values(todos[id] ?? {}).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0), 0);
}
