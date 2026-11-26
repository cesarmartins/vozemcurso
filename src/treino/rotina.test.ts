import { describe, expect, it } from 'vitest';
import { padraoPorId } from './padroes';
import { dataLocal, duracaoPasso, montarRotina, naSemana, ROTINA_PADRAO, sequencia, type ExercicioEnviado } from './rotina';

const enviado = (id: string): ExercicioEnviado => ({ id, nome: id, categoria: 'aquecimento', equipamento: '', obterAudio: async () => new Blob() });

describe('rotina', () => {
  it('começa pelos aparelhos, põe os do professor antes do desaquecimento', () => {
    const passos = montarRotina([enviado('a'), enviado('b')]);
    expect(passos[0].bloco).toBe('aparelhos');
    expect(passos.map((p) => p.bloco).filter((b, i, l) => l.indexOf(b) === i)).toEqual(['aparelhos', 'tecnica', 'professor', 'final']);
    expect(passos.filter((p) => p.tipo === 'professor').map((p) => p.id)).toEqual(['prof:a', 'prof:b']);
    expect(passos[passos.length - 1].bloco).toBe('final');
  });

  it('sem exercícios do professor, a rotina padrão continua completa e dura uns 20 minutos', () => {
    const passos = montarRotina([]);
    expect(passos.every((p) => p.tipo === 'padrao')).toBe(true);
    const minutos = passos.reduce((s, p) => s + duracaoPasso(p), 0) / 60;
    expect(minutos).toBeGreaterThan(12);
    expect(minutos).toBeLessThan(25);
    // Todo id da rotina padrão existe no catálogo.
    for (const { ids } of ROTINA_PADRAO) for (const id of ids) expect(padraoPorId.has(id)).toBe(true);
  });

  it('conta dias seguidos de treino', () => {
    expect(sequencia(['2026-11-24', '2026-11-25', '2026-11-26'], '2026-11-26')).toBe(3);
    // Hoje ainda não treinou: a sequência de ontem continua valendo.
    expect(sequencia(['2026-11-24', '2026-11-25'], '2026-11-26')).toBe(2);
    expect(sequencia(['2026-11-23'], '2026-11-26')).toBe(0);
    // Virada de mês.
    expect(sequencia(['2026-11-30', '2026-12-01'], '2026-12-01')).toBe(2);
    // Últimos 7 dias contando hoje: de 20 a 26 (o dia 19 fica de fora).
    expect(naSemana(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-26'], '2026-11-26')).toBe(3);
  });

  it('usa a data local, não UTC', () => {
    expect(dataLocal(new Date(2026, 10, 26, 23, 30))).toBe('2026-11-26');
  });
});
