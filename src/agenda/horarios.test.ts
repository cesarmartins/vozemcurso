import { describe, expect, it } from 'vitest';
import { conflito, descrever, duracaoTexto, minutos, ordenar, proximas, proximaVez, sobrepoe, validarHorario } from './horarios';

const aula = (dia: number, inicio: string, duracao = 60, id = `${dia}-${inicio}`) => ({ id, dia, inicio, duracao });

describe('horários', () => {
  it('lê e descreve horas', () => {
    expect(minutos('14:30')).toBe(870);
    expect(minutos('7:05')).toBe(425);
    expect(minutos('24:00')).toBeNull();
    expect(minutos('abc')).toBeNull();
    expect(descrever(aula(1, '14:00', 50))).toBe('Seg 14:00–14:50');
    expect(duracaoTexto(90)).toBe('1h30');
    expect(duracaoTexto(60)).toBe('1h');
    expect(duracaoTexto(45)).toBe('45 min');
  });

  it('acha conflito só quando os horários se cruzam no mesmo dia', () => {
    expect(sobrepoe(aula(2, '14:00'), aula(2, '14:30'))).toBe(true);
    expect(sobrepoe(aula(2, '14:00'), aula(2, '15:00'))).toBe(false); // uma termina quando a outra começa
    expect(sobrepoe(aula(2, '14:00'), aula(3, '14:00'))).toBe(false);
    const agenda = [aula(2, '14:00'), aula(2, '16:00')];
    expect(conflito(aula(2, '15:30', 60, 'nova'), agenda)?.inicio).toBe('16:00');
    // Editar a própria aula não conflita com ela mesma.
    expect(conflito({ ...agenda[0], duracao: 90 }, agenda)).toBeUndefined();
  });

  it('valida dia, hora e duração', () => {
    expect(validarHorario(aula(1, '14:00'))).toBeNull();
    expect(validarHorario(aula(7, '14:00'))).toMatch('dia');
    expect(validarHorario(aula(1, ''))).toMatch('hora');
    expect(validarHorario(aula(1, '14:00', 5))).toMatch('duração');
    expect(validarHorario(aula(1, '23:30', 60))).toMatch('meia-noite');
  });

  it('ordena de segunda a domingo', () => {
    const ordem = ordenar([aula(0, '09:00'), aula(3, '10:00'), aula(1, '18:00'), aula(1, '08:00')]);
    expect(ordem.map(descrever)).toEqual(['Seg 08:00–09:00', 'Seg 18:00–19:00', 'Qua 10:00–11:00', 'Dom 09:00–10:00']);
  });

  it('calcula a próxima aula', () => {
    const quartaMeioDia = new Date(2026, 10, 25, 12, 0); // 25/11/2026 é quarta-feira
    expect(proximaVez(aula(3, '14:00'), quartaMeioDia).getDate()).toBe(25); // hoje mais tarde
    expect(proximaVez(aula(3, '11:30'), quartaMeioDia).getDate()).toBe(25); // em andamento
    expect(proximaVez(aula(3, '09:00'), quartaMeioDia).getDate()).toBe(2); // já passou: semana que vem
    expect(proximaVez(aula(1, '09:00'), quartaMeioDia).getDate()).toBe(30); // segunda seguinte
    expect(proximas([aula(1, '09:00'), aula(4, '10:00'), aula(3, '14:00')], quartaMeioDia).map((a) => a.dia)).toEqual([3, 4, 1]);
  });
});
