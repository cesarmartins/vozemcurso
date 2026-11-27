// Histórico de práticas no Supabase (tabela "resultados").
// As telas leem de um cache em memória, preenchido por carregarResultados(); salvar grava no
// banco e atualiza o cache na hora. O banco só deixa ver as próprias práticas e as da turma.

import { supabase } from '../supabase';

export interface ResultadoPratica {
  data: number;
  acertos: number;
  avaliadas: number;
  desvioMedio: number;
}

interface Linha {
  aluno_id: string;
  exercicio_id: string;
  acertos: number;
  avaliadas: number;
  desvio_medio: number;
  criado_em: string;
}

/** contaId → exercicioId → práticas (da mais antiga para a mais recente) */
const cache = new Map<string, Map<string, ResultadoPratica[]>>();

/** Busca no banco as práticas destas contas (substitui o que havia no cache para elas). */
export async function carregarResultados(contas: readonly string[]): Promise<void> {
  const ids = [...new Set(contas)].filter(Boolean);
  if (!ids.length) return;
  const { data, error } = await supabase
    .from('resultados')
    .select('aluno_id, exercicio_id, acertos, avaliadas, desvio_medio, criado_em')
    .in('aluno_id', ids)
    .order('criado_em');
  if (error) return; // sem conexão: as telas mostram o que já estava no cache
  for (const id of ids) cache.set(id, new Map());
  for (const l of (data ?? []) as Linha[]) {
    const porEx = cache.get(l.aluno_id)!;
    const lista = porEx.get(l.exercicio_id) ?? [];
    lista.push({ data: Date.parse(l.criado_em), acertos: l.acertos, avaliadas: l.avaliadas, desvioMedio: l.desvio_medio });
    porEx.set(l.exercicio_id, lista);
  }
}

/** Práticas de um exercício feitas por estas contas, da mais antiga para a mais recente. */
export function resultadosDe(idExercicio: string, contas: readonly string[]): ResultadoPratica[] {
  return contas.flatMap((id) => cache.get(id)?.get(idExercicio) ?? []).sort((a, b) => a.data - b.data);
}

export async function salvarResultado(contaId: string, idExercicio: string, r: ResultadoPratica): Promise<boolean> {
  const { error } = await supabase.from('resultados').insert({
    aluno_id: contaId,
    exercicio_id: idExercicio,
    acertos: r.acertos,
    avaliadas: r.avaliadas,
    desvio_medio: r.desvioMedio,
  });
  if (error) return false;
  const porEx = cache.get(contaId) ?? new Map<string, ResultadoPratica[]>();
  porEx.set(idExercicio, [...(porEx.get(idExercicio) ?? []), r]);
  cache.set(contaId, porEx);
  return true;
}

/** "34 de 52 notas · 18 cents · 23/11" */
export function resumir(r: ResultadoPratica): string {
  const pct = r.avaliadas ? Math.round((r.acertos / r.avaliadas) * 100) : 0;
  const data = new Date(r.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${pct}% (${r.acertos} de ${r.avaliadas} notas) · ${Math.round(r.desvioMedio)} cents · ${data}`;
}

/** Quantas práticas estas contas registraram (do cache: chame carregarResultados antes). */
export function totalPraticas(contas: readonly string[]): number {
  let n = 0;
  for (const id of new Set(contas)) for (const lista of cache.get(id)?.values() ?? []) n += lista.length;
  return n;
}
