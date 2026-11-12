// "De potrero a leyenda": tu carrera temporada por temporada. En el celular, una tarjeta por temporada; en la compu (>= 900 px), una tabla con
// encabezado fijo. Tocá una temporada para ver lo que pasó (el relato, lo que elegiste, la Selección y los premios).
import { useState } from 'preact/hooks';
import { pl } from './careerBase';
import { trophyArt } from './careerTrophies';
import { AWARD } from './careerData';
import { Flag, ClubLogo, CompLogo, TrophyIcon } from './CareerVisuals';
import type { Career, SeasonLog } from './careerTypes';
import { fmtEuro } from './careerValue';
import { LEAGUES } from './careerWorld';

const year = (c: Career, h: SeasonLog) => c.y0 + h.age - 17;

function Delta({ h }: { h: SeasonLog }) {
  const d = h.ovr - h.ovr0;
  return <>{d !== 0 && <i class={d > 0 ? 'up' : 'down'}><span aria-hidden="true">{d > 0 ? '▲' : '▼'}</span>{Math.abs(d)}<span class="sr"> {d > 0 ? 'subió' : 'bajó'}</span></i>}</>;
}

/** Las marcas de la temporada: lesión, ascenso y descenso. */
function Marks({ h }: { h: SeasonLog }) {
  return (
    <span class="cr-s-marks">
      {h.injury && <span class="cr-mark inj" title={`Lesión ${h.injury}`}>LESIÓN</span>}
      {h.promo === 'up' && <span class="cr-mark up">▲ ASCENSO</span>}
      {h.promo === 'down' && <span class="cr-mark down">▼ DESCENSO</span>}
    </span>
  );
}

/** Los títulos de la temporada, como íconos chicos (con su nombre para quien los toca o los lee). */
function Cups({ h }: { h: SeasonLog }) {
  const best = h.awards.includes(AWARD.ballon);
  return (
    <span class="cr-s-cups" aria-label={h.trophies.length ? `Títulos: ${h.trophies.join(', ')}` : 'Sin títulos'}>
      {h.trophies.map(t => { const a = trophyArt(t); return <span class="cr-s-cup" title={t}><TrophyIcon shape={a.shape} tone={a.tone} size={22} /></span>; })}
      {best && <span class="cr-s-cup" title={AWARD.ballon}><TrophyIcon shape="ball" tone="gold" size={22} /></span>}
      {!h.trophies.length && !best && <span class="muted cr-dot" aria-hidden="true">·</span>}
    </span>
  );
}

function Detail({ c, h, keeper }: { c: Career; h: SeasonLog; keeper: boolean }) {
  return (
    <div class="cr-s-body">
      {h.lines.length > 0 && <ul class="cr-lines">{h.lines.map(l => <li>{l}</li>)}</ul>}
      {h.picks.length > 0 && <p class="cr-picks muted">Elegiste: {h.picks.join(' · ')}</p>}
      <dl class="cr-s-facts">
        <div><dt>Rol</dt><dd>{h.role}</dd></div>
        <div><dt>Nota</dt><dd>{h.pj > 0 ? h.rating.toFixed(1) : '—'}</dd></div>
        <div><dt>OVR</dt><dd>{h.ovr0} → {h.ovr}</dd></div>
        <div><dt>Valor</dt><dd>{fmtEuro(h.val)}</dd></div>
        {keeper && <div><dt>Vallas invictas</dt><dd>{h.cs}</dd></div>}
        {h.cont && <div><dt>Copa continental</dt><dd class="cr-s-cont"><CompLogo name={h.cont} size={16} /> {h.cont}</dd></div>}
      </dl>
      {(h.caps > 0 || h.tours.length > 0) && (
        <p class="cr-s-nat">
          <Flag nat={c.nat} size={16} /> <b>Selección:</b> {pl(h.caps, 'partido', 'partidos')} · {pl(h.capGoals, 'gol', 'goles')} · {pl(h.capAssists, 'asistencia', 'asistencias')}
          {h.tours.length > 0 && <span class="muted"> — {h.tours.join(' · ')}</span>}
        </p>
      )}
      {h.awards.length > 0 && (
        <ul class="cr-chips" aria-label="Premios">{h.awards.map(a => <li><span aria-hidden="true">⭐</span> {a}</li>)}</ul>
      )}
    </div>
  );
}

function Row({ c, h, keeper, open, toggle }: { c: Career; h: SeasonLog; keeper: boolean; open: boolean; toggle: () => void }) {
  const L = LEAGUES[h.lg];
  return (
    <li class={`cr-season${h.trophies.length ? ' won' : ''}${open ? ' open' : ''}`}>
      <button type="button" class="cr-s-head" aria-expanded={open} onClick={toggle}>
        <span class="cr-s-year"><b>{year(c, h)}</b><small>{h.age} años</small></span>
        <span class="cr-s-club">
          <ClubLogo name={h.club} size={28} />
          <span class="cr-s-cn">
            <b class="ellipsis">{h.club}</b>
            <small class="muted ellipsis"><CompLogo name={L.name} size={13} /> {L.name}{h.fin > 0 ? ` · ${h.fin}.º` : ''}</small>
          </span>
        </span>
        <span class="cr-s-ovr"><b>{h.ovr}</b><Delta h={h} /></span>
        <span class="cr-s-val cr-c" data-l="Valor">{fmtEuro(h.val)}</span>
        <span class="cr-s-stats">
          <span class="cr-c cr-c-pj" data-l="PJ">{h.pj}</span>
          <span class="cr-c cr-c-g" data-l="G">{h.goals}</span>
          <span class="cr-c cr-c-a" data-l="A">{h.assists}</span>
          {keeper && <span class="cr-c cr-c-vi" data-l="VI">{h.cs}</span>}
          <span class="cr-c cr-c-n" data-l="Nota">{h.pj > 0 ? h.rating.toFixed(1) : '—'}</span>
        </span>
        <span class="cr-s-sel cr-c" data-l="Selección">{h.caps > 0 ? <><Flag nat={c.nat} size={13} /> {h.caps}{h.capGoals ? ` · ${h.capGoals}g` : ''}{h.capAssists ? ` · ${h.capAssists}a` : ''}</> : <span class="muted">—</span>}</span>
        <Cups h={h} />
        <Marks h={h} />
        <span class="cr-s-caret" aria-hidden="true">▾</span>
      </button>
      {open && <Detail c={c} h={h} keeper={keeper} />}
    </li>
  );
}

/**
 * La lista de temporadas, de la más nueva a la más vieja. Con `limit`, muestra solo las últimas y un botón para ver las anteriores.
 * Es una tabla con encabezado fijo en la compu y tarjetas en el celular.
 */
export function Seasons({ c, limit }: { c: Career; limit?: number }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const rows = c.history;
  if (!rows.length) return null;
  const keeper = c.pos === 'ARQ' || c.pos === 'DEF';
  const shown = !limit || all ? [...rows].reverse() : [...rows].reverse().slice(0, limit);
  const hidden = rows.length - shown.length;
  return (
    <div class="cr-seasons-wrap">
      <div class={`cr-thead${keeper ? ' keeper' : ''}`} aria-hidden="true">
        <span>Año</span><span>Club</span><span>OVR</span><span>Valor</span><span>PJ</span><span>G</span><span>A</span>{keeper && <span title="Vallas invictas">VI</span>}<span>Nota</span><span>Selección</span><span>Títulos</span><span /><span />
      </div>
      <ol class={`cr-seasons${keeper ? ' keeper' : ''}`}>
        {shown.map(h => <Row key={h.n} c={c} h={h} keeper={keeper} open={open === h.n} toggle={() => setOpen(open === h.n ? null : h.n)} />)}
      </ol>
      {hidden > 0 && <button type="button" class="btn sm cr-more" onClick={() => setAll(true)}>Ver las {hidden} anteriores</button>}
    </div>
  );
}
