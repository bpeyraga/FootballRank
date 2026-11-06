import { useEffect, useState } from 'preact/hooks';

/** Ruta actual como segmentos del hash: "#/c/amigos" → ["c","amigos"]. */
export function useRoute(): string[] {
  const parse = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const go = (path: string) => { location.hash = '#/' + path; };

export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 34);

export const inviteUrl = (code: string) => `${location.origin}/#/join/${code}`;

/** Adónde volver después de iniciar sesión (lo guarda el login, lo usa main al entrar). */
export const NEXT_KEY = 'futrank-next';
