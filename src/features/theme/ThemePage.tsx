import { useState } from 'preact/hooks';
import type { Profile } from '../../shared/model';
import { Crest } from '../../shared/ui/Crest';
import { PALETTES, clubVars, loadTheme, saveTheme, type Mode, type Palette, type Theme as T } from './theme';

const MODES: [Mode, string][] = [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']];

/** Elegir modo (claro/oscuro) y paleta de colores. Se guarda en este dispositivo. */
export function Theme({ me }: { me: Profile }) {
  const [t, setT] = useState<T>(loadTheme);
  const club = clubVars(me.fav_team);
  const set = (patch: Partial<T>) => {
    const next = { ...t, ...patch };
    if (next.palette === 'club') next.club = club;   // siempre con los colores del club actual
    setT(next); saveTheme(next);
  };
  const pick = (palette: Palette) => set({ palette });

  return (
    <div class="wrap">
      <a href="#/" class="muted">← Volver</a>
      <h2 style="margin:8px 0 12px">Tema</h2>

      <div class="card">
        <h3 style="margin-bottom:10px">Modo</h3>
        <div class="th-seg" role="group" aria-label="Modo claro u oscuro">
          {MODES.map(([m, label]) => (
            <button type="button" class={t.mode === m ? 'on' : ''} aria-pressed={t.mode === m} onClick={() => set({ mode: m })}>{label}</button>
          ))}
        </div>
        <p class="muted st-note">Automático sigue la configuración de tu celular o computadora.</p>
      </div>

      <div class="card">
        <h3 style="margin-bottom:10px">Colores</h3>
        <div class="th-grid">
          {PALETTES.map(p => (
            <button type="button" class={`th-opt${t.palette === p.id ? ' on' : ''}`} aria-pressed={t.palette === p.id} onClick={() => pick(p.id)}>
              <span class="th-sw">{p.sw.map(c => <i style={`background:${c}`} />)}</span>
              <b>{p.name}</b>
              <small>{p.desc}</small>
            </button>
          ))}
          <button type="button" class={`th-opt${t.palette === 'club' ? ' on' : ''}`} aria-pressed={t.palette === 'club'}
            disabled={!club} onClick={() => pick('club')}>
            <span class="th-sw">{club
              ? [club.c, club.d, '#ffffff', '#1d1d1d'].map(c => <i style={`background:${c}`} />)
              : <i style="background:var(--line)" />}</span>
            <b>Mi club {me.fav_team && <Crest team={me.fav_team} size={14} />}</b>
            <small>{club ? `Con los colores de ${me.fav_team}` : 'Elegí tu equipo en "Editar perfil" para usarlo'}</small>
          </button>
        </div>
        <p class="muted st-note">El tema se guarda en este dispositivo.</p>
      </div>
    </div>
  );
}
