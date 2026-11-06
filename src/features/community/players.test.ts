import { describe, expect, it } from 'vitest';
import {
  BULK_MAX, addPlayerParams, dropLine, emptyPlayer, nPlayers, nextAction, nextPos, norm, parseBulk, parseLine, parsePos,
  playerError, selectToSave, setupDonePath, setupPath, stepDots, stepFromRoute, updatePlayerParams, validatePlayer,
} from './players';

describe('norm / parsePos / nextPos', () => {
  it('compara nombres sin acentos ni mayúsculas', () => {
    expect(norm('  José   PÉREZ ')).toBe('jose perez');
  });
  it('reconoce posiciones y sus nombres comunes', () => {
    expect(parsePos('del')).toBe('DEL');
    expect(parsePos('Arquero')).toBe('ARQ');
    expect(parsePos('Volante')).toBe('MED');
    expect(parsePos('defensor')).toBe('DEF');
    expect(parsePos('Chino')).toBeNull();
  });
  it('rota ARQ → DEF → MED → DEL → ARQ', () => {
    expect(nextPos('ARQ')).toBe('DEF');
    expect(nextPos('MED')).toBe('DEL');
    expect(nextPos('DEL')).toBe('ARQ');
  });
});

describe('parseLine', () => {
  it('nombre solo', () => {
    expect(parseLine('Juan Pérez')).toEqual({ name: 'Juan Pérez', pos: null });
  });
  it('posición con guion, coma, barra o paréntesis', () => {
    expect(parseLine('Juan Pérez - DEL')).toEqual({ name: 'Juan Pérez', pos: 'DEL' });
    expect(parseLine('Marcos,arq')).toEqual({ name: 'Marcos', pos: 'ARQ' });
    expect(parseLine('Tito / medio')).toEqual({ name: 'Tito', pos: 'MED' });
    expect(parseLine('Lucas (Def)')).toEqual({ name: 'Lucas', pos: 'DEF' });
  });
  it('no confunde "del" de un apellido con la posición (hace falta separador)', () => {
    expect(parseLine('Juan del Potro')).toEqual({ name: 'Juan del Potro', pos: null });
    expect(parseLine('Martín Del Pozo - DEF')).toEqual({ name: 'Martín Del Pozo', pos: 'DEF' });
  });
  it('un guion que no es posición queda en el nombre', () => {
    expect(parseLine('Ana-María')).toEqual({ name: 'Ana-María', pos: null });
    expect(parseLine('Juan - el flaco')).toEqual({ name: 'Juan - el flaco', pos: null });
    expect(parseLine('Ana-María - MED')).toEqual({ name: 'Ana-María', pos: 'MED' });
  });
  it('saca viñetas y numeración', () => {
    expect(parseLine('1. Pedro')).toEqual({ name: 'Pedro', pos: null });
    expect(parseLine('2) Marcos - DEL')).toEqual({ name: 'Marcos', pos: 'DEL' });
    expect(parseLine('- Nico')).toEqual({ name: 'Nico', pos: null });
    expect(parseLine('• El Chino')).toEqual({ name: 'El Chino', pos: null });
  });
  it('líneas vacías o solo con símbolos no son jugadores', () => {
    expect(parseLine('   ')).toBeNull();
    expect(parseLine('-')).toBeNull();
    expect(parseLine('- DEL')).toEqual({ name: 'DEL', pos: null });
  });
});

describe('parseBulk', () => {
  it('lee una lista, usa la posición por defecto y recuerda el número de línea', () => {
    const rows = parseBulk('Juan - DEL\n\nMarcos\nEl Chino (ARQ)', 'MED');
    expect(rows.map(r => [r.line, r.name, r.pos, r.explicit])).toEqual([
      [0, 'Juan', 'DEL', true], [2, 'Marcos', 'MED', false], [3, 'El Chino', 'ARQ', true],
    ]);
    expect(rows.every(r => r.status === 'ok')).toBe(true);
  });
  it('acepta saltos de línea de Windows', () => {
    expect(parseBulk('A\r\nB\r\n', 'DEF').map(r => r.name)).toEqual(['A', 'B']);
  });
  it('marca repetidos de la lista, los que ya están en el grupo y los nombres muy largos', () => {
    const rows = parseBulk('Juan\njuan\nJosé Pérez\n' + 'x'.repeat(41), 'MED', ['Jose Perez']);
    expect(rows.map(r => r.status)).toEqual(['ok', 'dup_list', 'dup_member', 'long']);
  });
  it('un cambio manual de posición pisa a la lista y al valor por defecto', () => {
    const rows = parseBulk('Ana - DEL\nBeto', 'MED', [], new Map([['ana', 'ARQ'], ['beto', 'DEF']]));
    expect(rows.map(r => r.pos)).toEqual(['ARQ', 'DEF']);
  });
});

describe('selectToSave / dropLine', () => {
  it('manda solo los ok; los repetidos entran si el admin los forzó', () => {
    const rows = parseBulk('Juan\nJuan\nPedro', 'MED');
    expect(selectToSave(rows).players).toEqual([{ name: 'Juan', pos: 'MED' }, { name: 'Pedro', pos: 'MED' }]);
    expect(selectToSave(rows).skipped).toBe(1);
    expect(selectToSave(rows, new Set(['juan'])).players).toHaveLength(3);
  });
  it('avisa cuántos sobran del tope de 60', () => {
    const text = Array.from({ length: BULK_MAX + 5 }, (_, i) => `Jugador ${i}`).join('\n');
    const r = selectToSave(parseBulk(text, 'MED'));
    expect(r.players).toHaveLength(BULK_MAX);
    expect(r.over).toBe(5);
  });
  it('dropLine saca una línea del texto', () => {
    expect(dropLine('a\nb\nc', 1)).toBe('a\nc');
  });
});

describe('validatePlayer', () => {
  it('sin nombre no se puede guardar (sin mensaje: todavía no escribió)', () => {
    expect(validatePlayer(emptyPlayer())).toEqual({ ok: false, hint: '' });
  });
  it('arma el valor limpio: espacios, apodo y club vacíos como null, número como entero', () => {
    const r = validatePlayer({ name: '  Juan   Pérez ', pos: 'DEL', nickname: ' ', shirt: ' 10 ', team: '' });
    expect(r).toEqual({ ok: true, value: { name: 'Juan Pérez', pos: 'DEL', nickname: null, shirt: 10, fav_team: null } });
  });
  it('respeta los límites de la base', () => {
    expect(validatePlayer({ ...emptyPlayer(), name: 'x'.repeat(41) }).ok).toBe(false);
    expect(validatePlayer({ ...emptyPlayer(), name: 'Ok', nickname: 'x'.repeat(21) }).ok).toBe(false);
    for (const shirt of ['0', '100', '1.5', 'abc']) expect(validatePlayer({ ...emptyPlayer(), name: 'Ok', shirt }).ok).toBe(false);
    expect(validatePlayer({ ...emptyPlayer(), name: 'Ok', shirt: '99' }).ok).toBe(true);
  });
  it('los parámetros de los RPC llevan los nombres de la migración', () => {
    const v = { name: 'Juan', pos: 'ARQ' as const, nickname: null, shirt: null, fav_team: 'River Plate' };
    expect(addPlayerParams('c1', v)).toEqual({ p_community: 'c1', p_name: 'Juan', p_pos: 'ARQ', p_nickname: null, p_shirt: null, p_fav_team: 'River Plate' });
    expect(updatePlayerParams('p1', 'c1', v)).toMatchObject({ p_profile: 'p1', p_community: 'c1', p_name: 'Juan' });
  });
});

describe('textos', () => {
  it('traduce los errores del servidor', () => {
    expect(playerError('forbidden')).toMatch(/permiso/);
    expect(playerError('new row: bad_shirt')).toMatch(/1 y 99/);
    expect(playerError('not_placeholder')).toMatch(/ya tiene cuenta/);
    expect(playerError('Could not find the function public.add_players(p_community, p_players) in the schema cache')).toMatch(/todavía no está activa/);
    expect(playerError('algo raro')).toBe('algo raro');
  });
  it('plural de jugadores', () => {
    expect(nPlayers(1)).toBe('1 jugador');
    expect(nPlayers(12)).toBe('12 jugadores');
  });
});

describe('asistente', () => {
  it('el paso sale del segmento de la ruta y por defecto es el primero', () => {
    expect(stepFromRoute(undefined)).toBe(0);
    expect(stepFromRoute('1')).toBe(0);
    expect(stepFromRoute('2')).toBe(1);
    expect(stepFromRoute('3')).toBe(2);
    expect(stepFromRoute('4')).toBe(0);
    expect(stepFromRoute('x')).toBe(0);
  });
  it('rutas del asistente y del final', () => {
    expect(setupPath('amigos', 0)).toBe('c/amigos/setup');
    expect(setupPath('amigos', 1)).toBe('c/amigos/setup/2');
    expect(setupPath('amigos', 9)).toBe('c/amigos/setup/3');
    expect(setupDonePath('amigos')).toBe('c/amigos');
  });
  it('puntitos de progreso', () => {
    expect(stepDots(0)).toEqual(['now', 'todo', 'todo']);
    expect(stepDots(1)).toEqual(['done', 'now', 'todo']);
    expect(stepDots(2)).toEqual(['done', 'done', 'now']);
  });
  it('"Después" si el paso está vacío, "Siguiente" si ya cargó algo y "Listo" al final', () => {
    expect(nextAction(0, 0)).toEqual({ label: 'Después', last: false });
    expect(nextAction(1, 3)).toEqual({ label: 'Siguiente', last: false });
    expect(nextAction(2, 0)).toEqual({ label: 'Listo', last: true });
  });
});
