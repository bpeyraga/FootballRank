import { describe as suite, expect, it, vi } from 'vitest';
import {
  MAX_PER_ERROR, MAX_PER_SESSION, MSG_MAX, STACK_MAX, appFrame, buildReport, createReporter, describe, fingerprint, foreignOnly, isNoise, makeThrottle,
  normalizeMessage, routePath, scrub, shortSource, type Context,
} from './errorsCore';

const ORIGIN = 'https://elpartidito.vercel.app';
const CTX: Context = { hash: '#/c/mi-grupo/chat', online: true, origin: ORIGIN };
const STACK = `TypeError: Cannot read properties of undefined (reading 'map')
    at Zr (${ORIGIN}/assets/CommunityPage-HjtKDZxi.js:1:23456)
    at ${ORIGIN}/assets/index-zm8leCbP.js:9:100`;

suite('scrub', () => {
  it('saca mails, tokens y parámetros de login', () => {
    expect(scrub('falló para juan.perez@mail.com.ar al guardar')).toBe('falló para [email] al guardar');
    expect(scrub('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc-DEF_123 listo')).toBe('token [token] listo');
    expect(scrub('GET /#access_token=abc.def&refresh_token=xyz&type=recovery')).toBe('GET /#access_token=[x]&refresh_token=[x]&type=recovery');
    expect(scrub('https://x.supabase.co/rest/v1/p?apikey=SECRETO&select=*')).toBe('https://x.supabase.co/rest/v1/p?apikey=[x]&select=*');
    expect(scrub('sin nada raro')).toBe('sin nada raro');
    expect(scrub('falló https://elpartidito.vercel.app/#/join/AbC123xyz al entrar')).toBe('falló https://elpartidito.vercel.app/#/join/[x] al entrar');
  });
});

suite('describe (motivo del error)', () => {
  it('Error: con el nombre si no es el genérico, y la pila', () => {
    const e = new TypeError('x is not a function');
    expect(describe(e).message).toBe('TypeError: x is not a function');
    expect(describe(e).stack).toContain('TypeError');
    expect(describe(new Error('listo')).message).toBe('listo');
    expect(describe({ name: 'TypeError', message: 'TypeError: ya trae el nombre' }).message).toBe('TypeError: ya trae el nombre');
  });
  it('texto, objetos con mensaje (como los de Supabase) y nada', () => {
    expect(describe('Uncaught TypeError: boom').message).toBe('boom');
    expect(describe({ message: 'JWT expired', code: 'PGRST301' }).message).toBe('JWT expired');
    expect(describe({ code: 42 }).message).toBe('Rechazo sin Error: {"code":42}');
    expect(describe({}).message).toBe('');
    expect(describe(undefined).message).toBe('');
    expect(describe(null).message).toBe('');
    expect(describe(404).message).toBe('404');
  });
  it('un objeto circular no rompe', () => {
    const o: Record<string, unknown> = {}; o.self = o;
    expect(describe(o).message).toBe('');
  });
});

suite('shortSource / routePath / appFrame', () => {
  it('shortSource: sin dominio ni query', () => {
    expect(shortSource(`${ORIGIN}/assets/Page-abc12345.js?x=1`, 12, 5)).toBe('/assets/Page-abc12345.js:12:5');
    expect(shortSource(`${ORIGIN}/assets/Page-abc12345.js`, 3)).toBe('/assets/Page-abc12345.js:3');
    expect(shortSource(undefined)).toBe('');
    expect(shortSource('')).toBe('');
  });
  it('routePath: la ruta de la app; nunca el hash del login', () => {
    expect(routePath('#/c/mi-grupo/chat')).toBe('#/c/mi-grupo/chat');
    expect(routePath('#/c/mi-grupo/partido/123e4567-e89b-12d3-a456-426614174000?x=1')).toBe('#/c/mi-grupo/partido/:id');
    expect(routePath('#/admin')).toBe('#/admin');
    expect(routePath('#/join/AbC123xyz')).toBe('#/join/:code'); // el código de invitación no se manda
    expect(routePath('')).toBe('#/');
    expect(routePath('#access_token=abc&refresh_token=def')).toBe('#/');
    expect(routePath('#error=access_denied')).toBe('#/');
    expect(routePath('#/' + 'a'.repeat(200)).length).toBe(80);
  });
  it('appFrame: archivo de la app sin el hash del build', () => {
    expect(appFrame(STACK)).toBe('CommunityPage.js');
    expect(appFrame(`at x (${ORIGIN}/assets/index-zm8leCbP.js:1:2)`)).toBe('index.js');
    expect(appFrame(`at x (${ORIGIN}/assets/use-seasons-DFaOFAK2.js:1:2)`)).toBe('use-seasons.js');
    expect(appFrame('at x (https://otro.com/lib.js:1:2)')).toBe('');
    expect(appFrame('')).toBe('');
  });
});

suite('fingerprint', () => {
  it('es de 16 caracteres hexa y estable', () => {
    const f = fingerprint("Cannot read properties of undefined (reading 'map')", STACK);
    expect(f).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint("Cannot read properties of undefined (reading 'map')", STACK)).toBe(f);
  });
  it('agrupa lo mismo aunque cambien ids, números largos o el hash del build', () => {
    const a = fingerprint('No se pudo cargar el partido 123e4567-e89b-12d3-a456-426614174000 (id 483920)', STACK);
    const b = fingerprint('No se pudo cargar el partido 99999999-e89b-12d3-a456-426614174999 (id 100000)', STACK.replace('HjtKDZxi', 'AAAAAAAA'));
    expect(a).toBe(b);
    const imp = fingerprint('Failed to fetch dynamically imported module: https://x.app/assets/ChatPage-abc12345.js', '');
    expect(imp).toBe(fingerprint('Failed to fetch dynamically imported module: https://x.app/assets/ChatPage-zzzzzzzz.js', ''));
  });
  it('separa errores distintos: otro mensaje u otro archivo', () => {
    const f = fingerprint("Cannot read properties of undefined (reading 'map')", STACK);
    expect(fingerprint("Cannot read properties of undefined (reading 'name')", STACK)).not.toBe(f);
    expect(fingerprint("Cannot read properties of undefined (reading 'map')", STACK.replace('CommunityPage', 'MatchPage'))).not.toBe(f);
    expect(fingerprint('HTTP 404', '')).not.toBe(fingerprint('HTTP 500', ''));
  });
  it('normalizeMessage', () => {
    expect(normalizeMessage('  mucho   espacio\n y mails a@b.com ')).toBe('mucho espacio y mails [email]');
    expect(normalizeMessage('x '.repeat(400)).length).toBeLessThanOrEqual(300);
  });
});

suite('isNoise', () => {
  const on = { online: true, origin: ORIGIN };
  const e = (message: string, extra: { stack?: string; source?: string } = {}) => ({ message, ...extra });
  it('lo que no es de la app ni de la red del usuario', () => {
    expect(isNoise(e('ResizeObserver loop completed with undelivered notifications.'), on)).toBe(true);
    expect(isNoise(e('ResizeObserver loop limit exceeded'), on)).toBe(true);
    expect(isNoise(e('Script error.'), on)).toBe(true);
    expect(isNoise(e('Script error'), on)).toBe(true);
    expect(isNoise(e(''), on)).toBe(true);
    expect(isNoise(e('   '), on)).toBe(true);
    expect(isNoise(e('boom', { source: 'chrome-extension://abcdef/content.js:1:1' }), on)).toBe(true);
    expect(isNoise(e('boom', { stack: 'at x (moz-extension://abcd/inject.js:1:1)' }), on)).toBe(true);
    expect(isNoise(e('boom', { stack: 'at x (safari-web-extension://abcd/inject.js:1:1)' }), on)).toBe(true);
    expect(isNoise(e("Can't find variable: _AutofillCallbackHandler"), on)).toBe(true);
    expect(isNoise(e('NavigatorLockAcquireTimeoutError: Acquiring an exclusive Navigator LockManager lock "lock:sb-abc-auth-token" immediately failed'), on)).toBe(true);
    expect(isNoise(e('Java object is gone'), on)).toBe(true);
    expect(isNoise(e('undefined is not an object (evaluating window.webkit.messageHandlers.x)'), on)).toBe(true);
  });
  it('cortes de red: AbortError siempre; "Failed to fetch" solo sin conexión', () => {
    expect(isNoise(e('AbortError: The user aborted a request.'), on)).toBe(true);
    expect(isNoise(e('signal is aborted without reason'), on)).toBe(true);
    expect(isNoise(e('The operation was aborted.'), on)).toBe(true);
    expect(isNoise(e('TypeError: Failed to fetch'), { online: false, origin: ORIGIN })).toBe(true);
    expect(isNoise(e('Load failed'), { online: false, origin: ORIGIN })).toBe(true);
    expect(isNoise(e('TypeError: Failed to fetch'), on)).toBe(false);
    expect(isNoise(e('Failed to fetch dynamically imported module: https://x/assets/a-b.js'), on)).toBe(false); // un deploy roto sí se avisa
  });
  it('errores de la app: no son ruido', () => {
    expect(isNoise(e("TypeError: Cannot read properties of undefined (reading 'map')", { stack: STACK }), on)).toBe(false);
    expect(isNoise(e('algo se rompió'), on)).toBe(false); // sin pila no se puede saber de dónde vino: se avisa
  });
  it('foreignOnly: pila toda de otro origen es ruido; mezcla o sin URLs no', () => {
    expect(foreignOnly('at a (https://www.googletagmanager.com/gtm.js:1:2)', ORIGIN)).toBe(true);
    expect(foreignOnly(STACK, ORIGIN)).toBe(false);
    expect(foreignOnly('at a (https://otro.com/a.js:1:2)\n at b (' + ORIGIN + '/assets/x-abcdefgh.js:3:4)', ORIGIN)).toBe(false);
    expect(foreignOnly('sin urls', ORIGIN)).toBe(false);
    expect(isNoise(e('boom', { stack: 'at a (https://otro.com/a.js:1:2)' }), on)).toBe(true);
  });
});

suite('buildReport', () => {
  it('arma el reporte limpio y recortado', () => {
    const r = buildReport({ message: `TypeError: no anda para a@b.com ${'x'.repeat(2000)}`, stack: STACK + '\n' + 'y'.repeat(9000), source: `${ORIGIN}/assets/x.js?token=abc` }, CTX)!;
    expect(r.message.length).toBeLessThanOrEqual(MSG_MAX);
    expect(r.message).toContain('[email]');
    expect(r.stack.length).toBeLessThanOrEqual(STACK_MAX);
    expect(r.source).toContain('token=[x]');
    expect(r.path).toBe('#/c/mi-grupo/chat');
    expect(r.fp).toMatch(/^[0-9a-f]{16}$/);
  });
  it('devuelve null si es ruido o está vacío', () => {
    expect(buildReport({ message: 'ResizeObserver loop limit exceeded' }, CTX)).toBeNull();
    expect(buildReport({ message: '  ' }, CTX)).toBeNull();
    expect(buildReport({ message: 'TypeError: Failed to fetch' }, { ...CTX, online: false })).toBeNull();
  });
  it('el hash del login no se filtra en la ruta', () => {
    expect(buildReport({ message: 'boom', stack: STACK }, { ...CTX, hash: '#access_token=SECRETO' })!.path).toBe('#/');
  });
});

suite('throttle y reporter', () => {
  it('tope por sesión y por error', () => {
    const t = makeThrottle(5, 2);
    expect(t.allow('a')).toBe(true);
    expect(t.allow('a')).toBe(true);
    expect(t.allow('a')).toBe(false); // el mismo error, a lo sumo 2 veces
    expect(t.allow('b')).toBe(true);
    expect(t.allow('c')).toBe(true);
    expect(t.allow('d')).toBe(true);
    expect(t.allow('e')).toBe(false); // 5 en total
  });
  it('los topes por defecto: 10 por sesión, 3 del mismo', () => {
    expect(MAX_PER_SESSION).toBe(10);
    expect(MAX_PER_ERROR).toBe(3);
    const t = makeThrottle();
    let ok = 0;
    for (let i = 0; i < 30; i++) if (t.allow('e' + i)) ok++;
    expect(ok).toBe(10);
  });
  it('el reporter filtra ruido, respeta el tope y nunca tira aunque el envío falle', async () => {
    const send = vi.fn().mockRejectedValue(new Error('sin red'));
    const rep = createReporter({ send, context: () => CTX, max: 3, perError: 2 });
    expect(rep.report({ message: 'ResizeObserver loop limit exceeded' })).toBe(false);
    expect(rep.report({ message: 'Script error.' })).toBe(false);
    expect(rep.report({ message: 'boom', stack: STACK })).toBe(true);
    expect(rep.report({ message: 'boom', stack: STACK })).toBe(true);
    expect(rep.report({ message: 'boom', stack: STACK })).toBe(false); // tercera del mismo
    expect(rep.report({ message: 'otro', stack: STACK })).toBe(true);
    expect(rep.report({ message: 'otro más', stack: STACK })).toBe(false); // 4ta en total
    expect(send).toHaveBeenCalledTimes(3);
    await Promise.resolve();
  });
  it('si el contexto tira, no rompe', () => {
    const rep = createReporter({ send: vi.fn(), context: () => { throw new Error('x'); } });
    expect(rep.report({ message: 'boom' })).toBe(false);
  });
});
