// Guardar el escudo diseñado (saveCommunityCrest) contra una base de mentira: el camino normal, el plan B cuando la base todavía no tiene
// set_community_crest (migración sin aplicar: es lo que corre hoy en producción) y que no queden archivos huérfanos en el bucket.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrestDesign } from './crestCore';

type Err = { message: string; code?: string } | null;
const COMM = '3f2a9c1e-1234-4abc-9def-0123456789ab';
const ROOT = `https://x.supabase.co/storage/v1/object/public/communities/`;

const state = {
  files: new Set<string>(),
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  /** Qué contesta cada función de la base. */
  rpc: {} as Record<string, () => Err>,
  uploadFails: false,
  uploads: [] as { path: string; type: string }[],
};

vi.mock('../../shared/supabase', () => {
  const bucket = {
    upload: async (path: string, blob: Blob, o: { contentType: string }) => {
      if (state.uploadFails) return { data: null, error: { message: 'storage down' } };
      state.files.add(path); state.uploads.push({ path, type: o.contentType });
      return { data: { path }, error: null };
    },
    remove: async (paths: string[]) => { for (const p of paths) state.files.delete(p); return { data: [], error: null }; },
    getPublicUrl: (path: string) => ({ data: { publicUrl: ROOT + path } }),
  };
  return {
    sb: {
      storage: { from: () => bucket },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        state.calls.push({ fn, args });
        const error = state.rpc[fn]?.() ?? null;
        return { data: null, error };
      },
    },
    must: <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; },
  };
});
vi.mock('./crestRender', () => ({
  crestPng: async () => new Blob(['png'], { type: 'image/png' }),
  crestJpeg: async () => new Blob(['jpg'], { type: 'image/jpeg' }),
}));

const { saveCommunityCrest } = await import('./api');
const { defaultCrest, isCrestUrl } = await import('./crestCore');

const design: CrestDesign = defaultCrest('Los Pibes', 140);
const prev = `${ROOT}${COMM}/logo-aaaaaaaa-0000-4000-8000-000000000000.jpg`;
const prevPath = `${COMM}/logo-aaaaaaaa-0000-4000-8000-000000000000.jpg`;

/** El mismo chequeo que hace set_community_logo en la base viva: solo <comunidad>/logo-<uuid>.jpg del bucket. */
const liveLogoRegex = new RegExp(`/storage/v1/object/public/communities/${COMM}/logo-[0-9a-f-]+\\.jpg(\\?v=\\d+)?$`);

beforeEach(() => {
  state.files = new Set([prevPath]); state.calls = []; state.rpc = {}; state.uploadFails = false; state.uploads = [];
});

describe('saveCommunityCrest', () => {
  it('con la migración aplicada: sube el PNG, llama set_community_crest con el diseño y borra el escudo anterior', async () => {
    const r = await saveCommunityCrest(COMM, design, prev, '#123456');
    expect(r).toEqual({ editable: true });
    expect(state.calls.map(c => c.fn)).toEqual(['set_community_crest']);
    const url = state.calls[0].args.p_url as string;
    expect(isCrestUrl(url)).toBe(true);
    expect(url.startsWith(ROOT + COMM + '/crest-')).toBe(true);
    expect(state.calls[0].args).toMatchObject({ p_community: COMM, p_design: design });
    expect([...state.files]).toEqual([url.slice(ROOT.length)]); // queda solo el nuevo
    expect(state.uploads.map(u => u.type)).toEqual(['image/png']);
  });

  it('sin la migración (PGRST202): borra el PNG que no sirvió y guarda un JPEG que pasa el chequeo de set_community_logo', async () => {
    state.rpc.set_community_crest = () => ({ code: 'PGRST202', message: 'Could not find the function public.set_community_crest(p_community, p_design, p_url) in the schema cache' });
    const r = await saveCommunityCrest(COMM, design, prev, '#123456');
    expect(r).toEqual({ editable: false });
    expect(state.calls.map(c => c.fn)).toEqual(['set_community_crest', 'set_community_logo']);
    const logo = state.calls[1].args.p_url as string;
    expect(logo).toMatch(liveLogoRegex);
    expect(isCrestUrl(logo)).toBe(false); // se ve dentro de la forma de siempre, sin forma propia
    expect(state.calls[1].args.p_community).toBe(COMM);
    // sin huérfanos: no queda el PNG, no queda el escudo anterior y sí el JPEG nuevo
    expect([...state.files]).toEqual([logo.slice(ROOT.length)]);
    expect(state.uploads.map(u => u.type)).toEqual(['image/png', 'image/jpeg']);
  });

  it('también detecta la falta de la función por el texto o por el código de Postgres', async () => {
    for (const e of [{ code: '42883', message: 'function does not exist' }, { message: 'Could not find the function public.set_community_crest in the schema cache' }]) {
      state.files = new Set(); state.calls = []; state.rpc.set_community_crest = () => e;
      expect(await saveCommunityCrest(COMM, design, null, '#123456')).toEqual({ editable: false });
      expect(state.calls.map(c => c.fn)).toEqual(['set_community_crest', 'set_community_logo']);
    }
  });

  it('otro error de la base (sin permiso, diseño inválido): tira el error, no cae al JPEG y no deja el PNG ni toca el escudo anterior', async () => {
    state.rpc.set_community_crest = () => ({ message: 'forbidden', code: 'P0001' });
    await expect(saveCommunityCrest(COMM, design, prev, '#123456')).rejects.toThrow('forbidden');
    expect(state.calls.map(c => c.fn)).toEqual(['set_community_crest']);
    expect([...state.files]).toEqual([prevPath]);
  });

  it('si en el plan B también falla set_community_logo, no quedan ni el PNG ni el JPEG y el escudo anterior sigue', async () => {
    state.rpc.set_community_crest = () => ({ code: 'PGRST202', message: 'not found' });
    state.rpc.set_community_logo = () => ({ message: 'bad_photo' });
    await expect(saveCommunityCrest(COMM, design, prev, '#123456')).rejects.toThrow('bad_photo');
    expect([...state.files]).toEqual([prevPath]);
  });

  it('si no se puede subir el PNG, tira el error sin llamar a la base', async () => {
    state.uploadFails = true;
    await expect(saveCommunityCrest(COMM, design, prev, '#123456')).rejects.toThrow('storage down');
    expect(state.calls).toEqual([]);
    expect([...state.files]).toEqual([prevPath]);
  });
});
