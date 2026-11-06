import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadPlayedMatch } from './api';
import { displayName, ovr, posLine, type Stats } from '../../shared/model';
import { go } from '../../app/router';
import { balance, type BPlayer, type Split } from './balance';
import { loadRanking, type Ranked } from '../ranking/ranking';
import { Avatar } from '../../shared/ui/Avatar';
import { EventRows, type EvPlayer } from './EventSteppers';
import { VenueField } from '../venues/VenueField';
import { NEW_VENUE, draftValid, emptyDraft, pickVenue } from '../venues/venues';
import type { Venue } from '../venues/maps';
import {
  applyTeams, autoScore, buildEvents, buildPlayers, bump, clampScore, defaultStart, quickError, selectAll, setSide,
  tally, toLocalInput, toggleSide, validateQuick, warnings, type CountsMap, type Sel, type Side,
} from './quickMatch';
import './quickmatch.css';

const NEUTRAL: Stats = { rit: 50, tir: 50, pas: 50, reg: 50, def: 50, fis: 50 };
type BP = BPlayer & { id: string };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const avg = (ps: BP[]) => ps.length ? Math.round(ps.reduce((t, p) => t + p.ovr, 0) / ps.length) : 0;

/**
 * Cargar un partido ya jugado en una sola pantalla: fecha y cancha, quiénes jugaron (con equipo),
 * resultado, goles y tarjetas. Se guarda todo junto con load_played_match.
 */
export function QuickMatch({ communityId, meId, slug, venues, defaultVenue, addVenue, cancel, rows: given }: {
  communityId: string; meId: string; slug: string; venues: Venue[]; defaultVenue: string;
  addVenue: (v: Venue) => void; cancel: () => void; rows?: Ranked[];
}) {
  const [rows, setRows] = useState<Ranked[] | null>(given ?? null);
  const [loadErr, setLoadErr] = useState('');
  const [when, setWhen] = useState(() => toLocalInput(defaultStart(new Date())));
  const [title, setTitle] = useState('Partido');
  const [venue, setVenue] = useState(defaultVenue);
  const [draft, setDraft] = useState(emptyDraft);
  const [sel, setSel] = useState<Sel>({});
  const [counts, setCounts] = useState<CountsMap>({});
  const [manual, setManual] = useState<{ a: number; b: number } | null>(null); // null = el resultado sale de los goles
  const [q, setQ] = useState('');
  const [fair, setFair] = useState<{ key: string; i: number; n: number; oa: number; ob: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const saving = useRef(false);
  const bal = useRef<{ key: string; splits: Split<BP>[] } | null>(null);

  const load = () => {
    setLoadErr('');
    loadRanking(communityId, meId).then(setRows).catch((e: any) => setLoadErr(e?.message ?? 'No pudimos cargar los jugadores.'));
  };
  useEffect(() => { scrollTo({ top: 0 }); if (!given) load(); }, []);
  useEffect(() => { if (given) setRows(given); }, [given]);

  const members = useMemo(() => (rows ?? [])
    .map(r => ({ r, id: r.profile.id, name: displayName(r.profile) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es')), [rows]);
  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  const t = tally(sel);
  const auto = autoScore(sel, counts);
  const score = manual ?? auto;
  const dirty = t.total > 0 || title !== 'Partido';
  const problem = validateQuick({ sel, counts, a: score.a, b: score.b, when, now: new Date() })
    ?? (venue === NEW_VENUE && !draftValid(draft) ? 'Completá el nombre de la cancha nueva.' : null);
  const warn = warnings(sel, counts, score.a, score.b);
  const selKey = Object.keys(sel).sort().join('|');

  const setScore = (side: 'a' | 'b', d: number) => setManual({ ...score, [side]: clampScore(score[side] + d) });
  const toBP = (id: string): BP => {
    const r = byId.get(id)?.r;
    const attrs = r?.votes ?? r?.base ?? NEUTRAL;
    return { id, pos: r?.profile.pos ?? 'MED', ovr: ovr(attrs), attrs };
  };

  // "Armar parejos": reparte a los marcados en A y B; tocarlo de nuevo muestra la siguiente mejor combinación.
  const doFair = () => {
    const ids = Object.keys(sel);
    if (ids.length < 2) return;
    if (bal.current?.key !== selKey) bal.current = { key: selKey, splits: balance(ids.map(toBP)) };
    const splits = bal.current.splits;
    if (!splits.length) return;
    const i = fair && fair.key === selKey ? (fair.i + 1) % splits.length : 0;
    const s = splits[i];
    setSel(applyTeams(sel, s.A.map(p => p.id), s.B.map(p => p.id)));
    setFair({ key: selKey, i, n: splits.length, oa: avg(s.A), ob: avg(s.B) });
  };

  const played: EvPlayer[] = members.filter(m => sel[m.id]).map(m => ({
    id: m.id, name: m.name, profile: m.r.profile, team: sel[m.id] === 'X' ? null : (sel[m.id] as 'A' | 'B'),
  }));
  const shown = q.trim() ? members.filter(m => norm(m.name).includes(norm(q.trim()))) : members;

  const back = () => { if (!dirty || confirm('¿Descartar el partido que estás cargando?')) cancel(); };

  const save = async () => {
    if (saving.current || problem) return; // un solo guardado a la vez
    saving.current = true; setBusy(true); setErr('');
    let ok = false;
    try {
      // Cancha nueva: se guarda primero; si el partido falla, queda elegida y un reintento no la duplica.
      const p = await pickVenue(venue, draft, venues, communityId, meId);
      if ('error' in p) setErr(p.error);
      else {
        if (p.created) { addVenue(p.created); setVenue(p.created.id); }
        const id = await loadPlayedMatch({
          communityId, title: title.trim() || 'Partido', startsAt: new Date(when).toISOString(),
          location: p.name, venueId: p.id, players: buildPlayers(sel), a: score.a, b: score.b, events: buildEvents(sel, counts),
        });
        ok = true; go(`c/${slug}/m/${id}`);
      }
    } catch (e: any) {
      setErr(quickError(e?.message ?? 'Error de red'));
    }
    // Si se guardó, la pantalla se va y queda bloqueada para que un segundo toque no lo duplique.
    if (!ok) { saving.current = false; setBusy(false); }
  };

  // Botón del control "— / A / B" de un jugador (función, no componente: no se remonta en cada render).
  const sideBtn = (id: string, s: Side | null, label: string) => {
    const on = (sel[id] ?? null) === s;
    return (
      <button type="button" class={`${s === 'A' ? 'a' : s === 'B' ? 'b' : ''} ${on ? 'on' : ''}`} aria-pressed={on}
        aria-label={s ? `${byId.get(id)!.name} juega en el Equipo ${s}` : `${byId.get(id)!.name} no jugó`}
        onClick={() => setSel(setSide(sel, id, s))}>{label}</button>
    );
  };

  return (
    <div class="qm">
      <div class="qm-top">
        <button type="button" class="btn sm" onClick={back} aria-label="Volver a partidos">‹ Volver</button>
        <h2>Cargar partido jugado</h2>
      </div>

      {/* 1. Cuándo y dónde */}
      <div class="card">
        <h3><span class="qm-nn">1</span>Fecha y cancha</h3>
        <label class="field"><span>Fecha y hora</span>
          <input type="datetime-local" value={when} max={toLocalInput(new Date())} onInput={e => setWhen((e.target as HTMLInputElement).value)} />
        </label>
        <VenueField venues={venues} value={venue} onChange={setVenue} draft={draft} onDraft={setDraft} />
        <details class="qm-title">
          <summary><span class="muted">Título:</span> <b class="ellipsis">{title.trim() || 'Partido'}</b><span class="linkbtn">Cambiar</span></summary>
          <input value={title} maxLength={80} aria-label="Título del partido" onInput={e => setTitle((e.target as HTMLInputElement).value)} />
        </details>
      </div>

      {/* 2. Quiénes jugaron */}
      <div class="card">
        <h3><span class="qm-nn">2</span>¿Quiénes jugaron?</h3>
        {rows === null && !loadErr && <p class="muted">Cargando jugadores…</p>}
        {loadErr && <><p class="err">{loadErr}</p><button type="button" class="btn sm" style="margin-top:8px" onClick={load}>Reintentar</button></>}
        {rows !== null && !members.length && <p class="muted">No hay miembros en la comunidad.</p>}
        {members.length > 0 && <>
          <p class="muted qm-help">Tocá <b>A</b> o <b>B</b> para cada uno, o el nombre para marcar que jugó.</p>
          <div class="qm-quick">
            <button type="button" class="btn sm" onClick={() => setSel(selectAll(sel, members.map(m => m.id)))}>Todos</button>
            <button type="button" class="btn sm" disabled={!t.total} onClick={() => setSel({})}>Ninguno</button>
            <button type="button" class="btn sm primary" disabled={t.total < 2} onClick={doFair}>
              {fair && fair.key === selKey ? 'Otra combinación' : 'Armar parejos'}
            </button>
          </div>
          <div class="qm-count" aria-live="polite">
            <span class="a">A: {t.a}</span><span class="b">B: {t.b}</span>
            {t.none > 0 && <span>Sin equipo: {t.none}</span>}
            <span class="muted qm-total">{t.total} {t.total === 1 ? 'jugó' : 'jugaron'}</span>
          </div>
          {fair && fair.key === selKey && <p class="muted qm-help">Opción {fair.i + 1} de {fair.n} · OVR A {fair.oa} · B {fair.ob}</p>}
          {members.length > 12 && (
            <input class="qm-search" type="search" placeholder="Buscar jugador…" value={q} aria-label="Buscar jugador"
              onInput={e => setQ((e.target as HTMLInputElement).value)} />
          )}
          <div class="qm-players">
            {shown.map(m => {
              const s = sel[m.id];
              return (
                <div class={`qm-pl ${s ? `on s-${s}` : ''}`}>
                  <button type="button" class="qm-who" aria-pressed={!!s} onClick={() => setSel(toggleSide(sel, m.id))}>
                    <Avatar p={m.r.profile} size={34} />
                    <span class="qm-name"><b class="ellipsis">{m.name}</b><small class="muted ellipsis">{s === 'X' ? 'Jugó · elegí equipo' : posLine(m.r.profile)}</small></span>
                  </button>
                  <div class="qm-seg" role="group" aria-label={`Equipo de ${m.name}`}>
                    {sideBtn(m.id, null, '—')}{sideBtn(m.id, 'A', 'A')}{sideBtn(m.id, 'B', 'B')}
                  </div>
                </div>
              );
            })}
            {q.trim() && !shown.length && <p class="muted">Nadie se llama así.</p>}
          </div>
        </>}
      </div>

      {/* 3. Resultado */}
      <div class="card">
        <h3><span class="qm-nn">3</span>Resultado</h3>
        <div class="qm-score">
          {(['a', 'b'] as const).map((k, i) => (
            <>
              {i === 1 && <span class="qm-vs" aria-hidden="true">–</span>}
              <div class="qm-side">
                <span class={k === 'a' ? 'ta' : 'tb'}>Equipo {k.toUpperCase()}</span>
                <div class="qm-big">
                  <button type="button" disabled={score[k] <= 0} aria-label={`Un gol menos para el Equipo ${k.toUpperCase()}`} onClick={() => setScore(k, -1)}>−</button>
                  <b aria-live="polite">{score[k]}</b>
                  <button type="button" disabled={score[k] >= 99} aria-label={`Un gol más para el Equipo ${k.toUpperCase()}`} onClick={() => setScore(k, 1)}>+</button>
                </div>
              </div>
            </>
          ))}
        </div>
        {manual && (manual.a !== auto.a || manual.b !== auto.b)
          ? <p class="muted qm-help" style="text-align:center"><button type="button" class="linkbtn" onClick={() => setManual(null)}>Usar los goles cargados abajo ({auto.a} – {auto.b})</button></p>
          : <p class="muted qm-help" style="text-align:center">{manual ? 'Resultado cargado a mano.' : 'Se completa solo con los goles que cargues abajo; también podés usar − y +.'}</p>}
        {warn.map(w => <p class="note qm-warn">{w}</p>)}
      </div>

      {/* 4. Goles y tarjetas */}
      <div class="card">
        <h3><span class="qm-nn">4</span>Goles y tarjetas <small class="muted">(opcional)</small></h3>
        {!played.length
          ? <p class="muted">Primero marcá quiénes jugaron.</p>
          : <>
              <p class="muted qm-help">⚽ goles · 👟 asistencias · 🟨 amarilla · 🟥 roja</p>
              <EventRows players={played} counts={counts} onStep={(id, kind, dir) => setCounts(c => bump(c, id, kind, dir))} />
            </>}
      </div>

      {err && <p class="err qm-err" role="alert">{err}</p>}

      <div class="qm-bar">
        <p class="muted qm-hint">{problem ?? `${t.total} jugadores · ${score.a} – ${score.b}`}</p>
        <button type="button" class="btn primary block" disabled={busy || !!problem} onClick={save}>
          {busy ? 'Guardando…' : 'Guardar partido'}
        </button>
      </div>
    </div>
  );
}
