import { useState } from 'preact/hooks';
import { closeSeason, deleteSeason, startSeason } from './api';
import { closedSeasons, defaultStart, NAME_MAX, openSeason, seasonError, seasonSpan, startError, type Season } from './model';
import { useSeasons } from './useSeasons';
import './seasons.css';

/**
 * Temporadas de la comunidad, solo para owner/admins (pestaña Miembros): empezar una con nombre y fecha, ver la actual,
 * cerrarla (calcula los campeones) y borrar las que sobran. Una sola abierta a la vez.
 */
export function SeasonsCard({ communityId }: { communityId: string }) {
  const q = useSeasons(communityId);
  const seasons = q.data?.seasons ?? [];
  const awards = q.data?.awards ?? [];
  const open = openSeason(seasons);
  const closed = closedSeasons(seasons);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');   // '' = la sugerida (hoy, o el día después del cierre de la última)
  const startOn = start || defaultStart(seasons);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  /** Corre una acción: muestra el error traducido si falla; si sale bien, recarga y devuelve true. */
  const run = async (key: string, f: () => Promise<unknown>) => {
    if (busy) return false;
    setBusy(key); setErr(''); setNote('');
    try { await f(); } catch (e: any) { setErr(seasonError(e?.message ?? '')); setBusy(''); return false; }
    setBusy('');
    q.reload();
    return true;
  };

  const begin = async () => {
    const n = name.trim();
    const bad = startError(n, startOn, seasons);
    if (bad) return setErr(bad);
    if (await run('start', () => startSeason(communityId, n, startOn))) {
      setName(''); setStart('');
      setNote(`Empezó "${n}". Cuando termine, cerrala para coronar a los campeones.`);
    }
  };

  const close = async (s: Season) => {
    if (!confirm(`¿Cerrar "${s.name}"?\n\nSe calculan los campeones (goleador, asistidor, figura, más presente y fair play) con todos los partidos jugados de la temporada hasta hoy, y queda cerrada. Después podés empezar otra.\n\nAntes de cerrar, cargá los resultados que falten: lo que se cargue después no cambia los campeones.`)) return;
    let given = 0;
    if (await run('close', async () => { given = await closeSeason(s.id); })) {
      setNote(given
        ? `Cerraste "${s.name}": ${given} ${given === 1 ? 'premio entregado' : 'premios entregados'}. Los ves en "Campeones", en el Ranking.`
        : `Cerraste "${s.name}", pero no hubo partidos jugados en esas fechas: queda sin campeones.`);
    }
  };

  const remove = async (s: Season) => {
    const n = awards.filter(a => a.season_id === s.id).length;
    const lost = n ? ` Se pierden sus campeones (${n} ${n === 1 ? 'premio' : 'premios'}).` : '';
    if (!confirm(`¿Borrar la temporada "${s.name}"?${lost} Los partidos y las estadísticas no se tocan.`)) return;
    if (await run('del', () => deleteSeason(s.id))) setNote(`Borraste "${s.name}".`);
  };

  return (
    <div class="card adm-card sn-admin">
      <h3 style="margin-bottom:4px">Temporadas</h3>
      <p class="muted adm-note">
        Armá torneos con fecha (Apertura 2026): el ranking se puede ver por temporada y, al cerrarla, se corona a los campeones.
      </p>
      {!q.data && !q.err && <p class="muted">Cargando temporadas…</p>}
      {q.err && !q.data && (
        <p class="err" role="alert">No pudimos cargar las temporadas. {q.err} <button class="btn sm" onClick={q.reload}>Reintentar</button></p>
      )}

      {q.data && open && (
        <div class="sn-open">
          <span class="sn-open-tag">Temporada actual</span>
          <b class="sn-open-name ellipsis">{open.name}</b>
          <span class="muted">{seasonSpan(open)}</span>
          <div class="sn-open-acts">
            <button class="btn primary" disabled={!!busy} onClick={() => close(open)}>{busy === 'close' ? 'Cerrando…' : 'Cerrar temporada'}</button>
            <button class="btn danger" disabled={!!busy} aria-label={`Borrar la temporada ${open.name}`} onClick={() => remove(open)}>Borrar</button>
          </div>
        </div>
      )}

      {q.data && !open && (
        <>
          <label class="field"><span>Nombre</span>
            <input value={name} maxLength={NAME_MAX} placeholder={`Apertura ${new Date().getFullYear()}`}
              onInput={e => setName((e.target as HTMLInputElement).value)} /></label>
          <label class="field"><span>Empieza el</span>
            <input type="date" value={startOn} onInput={e => setStart((e.target as HTMLInputElement).value)} /></label>
          <button class="btn primary block" disabled={!!busy || !name.trim()} onClick={begin}>{busy === 'start' ? 'Empezando…' : 'Empezar temporada'}</button>
        </>
      )}

      {q.data && closed.length > 0 && (
        <div class="sn-past">
          <span class="adm-label">Temporadas cerradas</span>
          {closed.map(s => {
            const n = awards.filter(a => a.season_id === s.id).length;
            return (
              <div class="row sn-past-row">
                <div class="sn-past-main">
                  <b class="ellipsis" style="display:block">{s.name}</b>
                  <div class="muted" style="font-size:.85rem">{seasonSpan(s)} · {n ? `${n} ${n === 1 ? 'premio' : 'premios'}` : 'sin campeones'}</div>
                </div>
                <button class="btn sm danger" disabled={!!busy} aria-label={`Borrar la temporada ${s.name}`} onClick={() => remove(s)}>Borrar</button>
              </div>
            );
          })}
        </div>
      )}

      {note && <p class="sn-ok" role="status">{note}</p>}
      {err && <p class="err" role="alert">{err}</p>}
    </div>
  );
}
