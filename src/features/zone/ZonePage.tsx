import { useMemo, useState } from 'preact/hooks';
import { ATTRS, POS, type Pos, type Profile } from '../../shared/supabase';
import { Avatar } from '../../shared/ui/Avatar';
import { Crest } from '../../shared/ui/Crest';
import { FutCard } from '../../shared/ui/FutCard';
import { Sheet } from '../../shared/ui/Sheet';
import { whatsappUrl } from '../matches/share';
import { ZonePicker } from './ZonePicker';
import {
  DEFAULT_RADIUS, RADII, SHOW_MAX, buildZoneRanking, fmtDistance, inviteText, isUnnamed, miniStats, ovrSource, posCounts, shortZone, splitPodium, visibleRanking, widerRadius, zoneErrorText, zoneLine,
  type ZoneDraft, type ZonePlayer,
} from './model';
import { useMyZone, useZoneRanking } from './useZone';

/** Hace "clickeable" un div con teclado (Enter / espacio): adentro lleva una carta, que no puede ir dentro de un <button>. */
const press = (fn: () => void) => ({
  role: 'button' as const, tabIndex: 0, onClick: fn,
  onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
});

const cardOf = (p: ZonePlayer) => ({ name: p.name, photo_url: p.photo_url, pos: p.pos, shirt_number: p.shirt_number, fav_team: p.fav_team });

/** Ranking de tu zona: los jugadores del barrio que decidieron aparecer, ordenados por OVR. */
export function Zone({ me }: { me: Profile }) {
  const mz = useMyZone();
  const zone = mz.zone;
  const rk = useZoneRanking(!!zone, zone ? `${zone.lat},${zone.lng},${zone.public}` : '');
  const [km, setKm] = useState(DEFAULT_RADIUS);
  const [pos, setPos] = useState<Pos | null>(null);
  const [sel, setSel] = useState<ZonePlayer | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const rows = rk.rows;
  const list = useMemo(() => (rows ? buildZoneRanking(rows, me.id, { km, pos }) : []), [rows, me.id, km, pos]);
  const counts = useMemo(() => (rows ? posCounts(rows, km) : null), [rows, km]);
  const { shown, mine, hidden } = useMemo(() => visibleRanking(list), [list]);
  const { podium, rest } = useMemo(() => splitPodium(shown), [shown]);
  const anySelfRated = list.some(p => !p.voted);
  const label = zone && !isUnnamed(zone.label) ? zone.label : 'Tu zona';

  const save = async (z: ZoneDraft | null) => {
    setBusy(true); setErr('');
    try { await mz.save(z); setEditing(false); } catch (e) { setErr(zoneErrorText(e)); }
    setBusy(false);
  };

  const invite = () => {
    const text = inviteText(zone?.label ?? '', location.origin);
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open(whatsappUrl(text), '_blank', 'noopener');
  };

  const back = <a class="muted zn-back" href="#/">← Inicio</a>;

  // Cargando mi zona
  if (zone === undefined) return (
    <div class="wrap zn-page">{back}<div class="zn-sk zn-sk-hero" aria-hidden="true" /><p class="muted" role="status" style="text-align:center">Cargando…</p></div>
  );

  // Sin zona (o cambiándola): elegirla acá mismo
  if (!zone || editing) return (
    <div class="wrap zn-page">
      {back}
      <header class="zn-intro">
        <span class="zn-kicker zn-kicker-dark">Ranking de tu zona</span>
        <h2>¿Quién es el mejor de tu barrio?</h2>
        <p class="muted">Contanos dónde jugás y mirá el ranking de los jugadores cerca tuyo. Es opcional y podés dejar de participar cuando quieras.</p>
      </header>
      {mz.err && <p class="err" role="alert">{mz.err}</p>}
      <ZoneSetup key={editing ? 'edit' : 'new'} initial={zone ?? null} busy={busy} err={err} onSave={save} onCancel={zone ? () => { setEditing(false); setErr(''); } : undefined} />
    </div>
  );

  const total = counts?.all ?? 0;
  const inFilter = counts ? (pos ? counts[pos] : counts.all) : 0;
  const others = total - (rows?.some(r => r.profile_id === me.id && r.distance_band <= km) ? 1 : 0);
  const wider = rows ? widerRadius(rows, km, me.id) : null;

  return (
    <div class="wrap zn-page">
      {back}
      <section class="zn-hero">
        <span class="zn-grass" aria-hidden="true" />
        <svg class="zn-pitch" viewBox="0 0 200 200" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="3"><circle cx="100" cy="100" r="62" /><circle cx="100" cy="100" r="5" fill="currentColor" /><path d="M-10 100h220" /></g>
        </svg>
        <span class="zn-kicker">Ranking de tu zona</span>
        <h2 class="zn-title"><span class="zn-cup" aria-hidden="true">🏆</span><span class="zn-title-txt">{label}</span></h2>
        <p class="zn-sub">
          {rows ? `${inFilter} ${inFilter === 1 ? 'jugador' : 'jugadores'} a ${km} km o menos${pos ? ` · ${pos}` : ''}` : 'Buscando jugadores…'}
        </p>
        <div class="zn-radius" role="group" aria-label="Radio de la zona">
          {RADII.map(r => <button type="button" class={km === r ? 'on' : ''} aria-pressed={km === r} onClick={() => setKm(r)}>{r} km</button>)}
        </div>
        <button type="button" class="zn-change" onClick={() => { setEditing(true); setErr(''); }}>Cambiar zona</button>
      </section>

      {!zone.public && (
        <div class="card zn-note" role="status">
          <span aria-hidden="true">🔒</span>
          <p>Estás viendo el ranking, pero <b>vos no aparecés</b>. Activalo cuando quieras: solo se muestra tu barrio y la distancia aproximada.</p>
          <button type="button" class="btn sm primary" disabled={busy} onClick={() => save({ ...zone, public: true })}>{busy ? 'Un segundo…' : 'Aparecer'}</button>
        </div>
      )}
      {err && <p class="err" role="alert">{err}</p>}

      <div class="zn-pos" role="group" aria-label="Filtrar por posición">
        {([null, ...POS] as (Pos | null)[]).map(p => {
          const n = counts ? (p ? counts[p] : counts.all) : null;
          return (
            <button type="button" class={pos === p ? 'on' : ''} aria-pressed={pos === p} onClick={() => setPos(p)}>
              {p ?? 'Todos'}{p && n != null && <small>{n}</small>}
            </button>
          );
        })}
      </div>

      {rk.err && (
        <div class="card zn-empty" role="alert">
          <p class="err" style="margin:0 0 12px">{rk.err}</p>
          <button type="button" class="btn" onClick={rk.reload}>Reintentar</button>
        </div>
      )}
      {!rk.err && !rows && <ListSkeleton />}

      {rows && total === 0 && (
        <div class="card zn-empty">
          <span class="zn-empty-ico" aria-hidden="true">🏟️</span>
          {wider
            ? <><b>Nadie a {km} km todavía</b><p class="muted">Hay jugadores un poco más lejos: ampliá el radio para verlos.</p>
                <button type="button" class="btn primary" onClick={() => setKm(wider)}>Ver hasta {wider} km</button></>
            : <><b>Sos de los primeros de tu zona</b><p class="muted">Todavía no hay otros jugadores cerca. Invitá a tus amigos y armen el ranking del barrio.</p>
                <button type="button" class="btn primary" onClick={invite}>Invitar amigos</button></>}
        </div>
      )}

      {rows && total > 0 && list.length === 0 && (
        <div class="card zn-empty"><span class="zn-empty-ico" aria-hidden="true">🧤</span><b>Nadie juega de {pos} en este radio</b>
          <p class="muted">Probá con otra posición o ampliá el radio.</p>
          <button type="button" class="btn" onClick={() => setPos(null)}>Ver todos</button></div>
      )}

      {list.length > 0 && (
        <div class="zn-body">
          {others === 0 && (
            <div class="card zn-note zn-alone">
              <span aria-hidden="true">👋</span>
              <p>Por ahora sos el único a {km} km. {wider ? 'Ampliá el radio o invitá' : 'Invitá'} a tus amigos y armen el ranking del barrio.</p>
              <div class="zn-note-actions">
                {wider && <button type="button" class="btn sm primary" onClick={() => setKm(wider)}>Ver hasta {wider} km</button>}
                <button type="button" class={`btn sm${wider ? '' : ' primary'}`} onClick={invite}>Invitar</button>
              </div>
            </div>
          )}
          {podium.length > 0 && <div class="zn-podium" role="list" aria-label="Podio">
            {[podium[1], podium[0], podium[2]].filter(Boolean).map(p => (
              <div role="listitem" class={`zn-pod p${p.rank}${p.isMe ? ' me' : ''}`}>
                <div class="zn-pod-hit" {...press(() => setSel(p))} aria-label={`Puesto ${p.rank}: ${p.name}, OVR ${p.ovr}. Ver detalle`}>
                  {p.rank === 1 && <span class="zn-crown" aria-hidden="true">👑</span>}
                  <span class="zn-card"><FutCard p={cardOf(p)} stats={p.stats} size="sm" /></span>
                  <span class="zn-pod-sub">{p.isMe && <b>Vos</b>}{shortZone(p.zoneLabel) && !p.isMe && <b>{shortZone(p.zoneLabel)}</b>}<span>{p.isMe ? shortZone(p.zoneLabel) : fmtDistance(p.distanceBand)}</span></span>
                </div>
                <div class="zn-step" aria-hidden="true">{p.rank}</div>
              </div>
            ))}
          </div>}

          {(rest.length > 0 || mine) && (
            <div class="card zn-list">
              {rest.map(p => <Row p={p} onOpen={() => setSel(p)} />)}
              {mine && <>
                <div class="zn-gap muted" aria-hidden="true">· · ·</div>
                <Row p={mine} onOpen={() => setSel(mine)} />
              </>}
              {hidden > 0 && <p class="muted zn-more">Mostramos los primeros {SHOW_MAX}. Y {hidden} {hidden === 1 ? 'jugador más' : 'jugadores más'}: filtrá por posición o elegí un radio más chico para ver otros.</p>}
            </div>
          )}
          {anySelfRated && (
            <p class="muted zn-selfnote">
              <b>Autoevaluado</b> = todavía no lo votaron sus compañeros, así que su OVR es el que se puso él mismo. Va después de los votados y no entra al podio.
            </p>
          )}
        </div>
      )}

      {sel && <PlayerSheet p={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

/** Elegir o cambiar la zona dentro de la pantalla (mismo selector que el perfil). */
function ZoneSetup({ initial, busy, err, onSave, onCancel }: {
  initial: ZoneDraft | null; busy: boolean; err: string; onSave: (z: ZoneDraft | null) => void; onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<ZoneDraft | null>(initial);
  const removing = !draft && !!initial;
  return (
    <div class="card zn-setup">
      <h3>¿Dónde jugás?</h3>
      <ZonePicker value={draft} onChange={setDraft} disabled={busy} />
      <button type="button" class={`btn block ${removing ? 'danger' : 'primary'}`} disabled={busy || (!draft && !initial)} onClick={() => onSave(draft)}>
        {busy ? 'Guardando…' : removing ? 'Quitar mi zona' : initial ? 'Guardar' : 'Guardar y ver el ranking'}
      </button>
      {onCancel && <button type="button" class="btn block" style="margin-top:8px" disabled={busy} onClick={onCancel}>Cancelar</button>}
      {err && <p class="err" role="alert">{err}</p>}
    </div>
  );
}

function Row({ p, onOpen }: { p: ZonePlayer; onOpen: () => void }) {
  return (
    <div class={`zn-row${p.isMe ? ' me' : ''}`} {...press(onOpen)} aria-label={`Puesto ${p.rank}: ${p.name}, OVR ${p.ovr}. Ver detalle`}>
      <span class="zn-rank">{p.rank}</span>
      <Avatar p={p} size={44} />
      <div class="zn-row-main">
        <div class="zn-row-name">
          <span class="ellipsis">{p.name}</span>
          {p.isMe && <span class="zn-me">vos</span>}
          <Crest team={p.fav_team} size={11} />
        </div>
        <div class="muted ellipsis zn-row-sub">{p.pos}{zoneLine(p, true) ? ` · ${zoneLine(p, true)}` : ''}</div>
        <div class="muted zn-row-mini">{!p.voted && <span class="zn-self" title="Todavía no lo votaron sus compañeros">autoevaluado</span>}<span>{miniStats(p)}</span></div>
      </div>
      <span class="zn-attrs" aria-hidden="true">{ATTRS.map(([k, l]) => <i><b>{p.stats[k]}</b>{l}</i>)}</span>
      <span class={`ovr ${p.tier}`}>{p.ovr}</span>
    </div>
  );
}

/** Ficha corta de un jugador de la zona: su carta, sus números y de dónde sale su OVR. No lleva a ninguna comunidad. */
function PlayerSheet({ p, onClose }: { p: ZonePlayer; onClose: () => void }) {
  return (
    <Sheet title={p.name} onClose={onClose}>
      <div class="zn-sheet">
        <FutCard p={cardOf(p)} stats={p.stats} size="md" />
        <div class="zn-sheet-copy">
          <div class="zn-sheet-chips">
            <span class={`ovr ${p.tier}`}>OVR {p.ovr}</span>
            <span>{p.pos}</span>
            {p.shirt_number ? <span>#{p.shirt_number}</span> : null}
            {p.fav_team && <span class="zn-club"><Crest team={p.fav_team} size={14} /> {p.fav_team}</span>}
          </div>
          <p>#{p.rank} de tu zona{p.isMe ? ' (vos)' : ''}</p>
          {zoneLine(p) && <p class="muted">📍 {zoneLine(p)}</p>}
          <p class="muted zn-sheet-src">{ovrSource(p)}</p>
        </div>
      </div>
      <div class="st-grid c4" style="margin-top:14px">
        <div class="st-tile"><b>{p.pj}</b><span>Partidos</span></div>
        <div class="st-tile"><b>{p.goals}</b><span>Goles</span></div>
        <div class="st-tile"><b>{p.assists}</b><span>Asistencias</span></div>
        <div class="st-tile"><b>{p.mvps}</b><span>Figura</span></div>
      </div>
      <p class="muted zn-sheet-foot">
        {p.communities > 0 ? `Juega en ${p.communities} ${p.communities === 1 ? 'comunidad' : 'comunidades'}. ` : ''}
        Solo ves lo que cada jugador decidió mostrar en el ranking de la zona.
      </p>
    </Sheet>
  );
}

function ListSkeleton() {
  return (
    <div class="zn-skeleton" aria-hidden="true">
      <div class="zn-sk-pod"><i class="zn-sk" /><i class="zn-sk" /><i class="zn-sk" /></div>
      {[0, 1, 2, 3].map(() => <div class="zn-sk zn-sk-row" />)}
    </div>
  );
}
