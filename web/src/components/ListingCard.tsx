import { useState } from 'react';
import { fmtEuro } from '../api';
import { locationLabel, mapsEmbedUrl, mapsUrl } from '../maps';
import type { Listing } from '../types';

interface Props {
  listing: Listing;
  newSince: string | null;
  onToggleFavorite: (id: number, on: boolean) => void;
  onToggleHidden: (id: number, on: boolean) => void;
}

function range(vals: (number | null)[], unit = ''): string {
  const nums = vals.filter((v): v is number => v !== null);
  if (nums.length === 0) return '?';
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`;
}

function scoreClass(score: number): string {
  if (score >= 80) return 'score-high';
  if (score >= 60) return 'score-mid';
  return 'score-low';
}

export function ListingCard({ listing: l, newSince, onToggleFavorite, onToggleHidden }: Props) {
  const [showMap, setShowMap] = useState(false);
  const isNew = newSince !== null && l.firstSeenAt > newSince;
  const isFav = l.favoritedAt !== null;
  const isHidden = l.hiddenAt !== null;
  const eurPerSqm = l.sqm && l.sqm > 0 ? Math.round(l.price / l.sqm) : null;
  const location = locationLabel(l);
  const goodValue = l.valuePct != null && l.valuePct >= 8;
  const availUnits = (l.units ?? []).filter((u) => !u.sold);
  const soldCount = (l.units?.length ?? 0) - availUnits.length;
  const isPromo = (l.units?.length ?? 0) > 0;

  return (
    <article className={`card${isNew ? ' card-new' : ''}${l.isActive ? '' : ' card-gone'}`}>
      <div className="card-media-wrap">
        <a className="card-media" href={l.url} target="_blank" rel="noreferrer">
          {l.images[0] ? <img src={l.images[0]} alt="" loading="lazy" /> : <div className="card-placeholder">🏠</div>}
          {isNew && <span className="badge-new">NEW</span>}
          {!l.isActive && <span className="badge-gone">GONE — no longer listed</span>}
          {l.isNewBuild && <span className="badge-newbuild">new build</span>}
          {l.ai && (
            <span className={`badge-score ${scoreClass(l.ai.score)}`} title="Claude gem score (0–100)">
              {l.ai.score}
            </span>
          )}
        </a>
        <button
          className={`fav-btn${isFav ? ' fav-on' : ''}`}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => onToggleFavorite(l.id, !isFav)}
        >
          {isFav ? '♥' : '♡'}
        </button>
      </div>
      <div className="card-body">
        <div className="card-price-row">
          <span className="card-price">
            {isPromo && <span className="price-desde">desde </span>}
            {fmtEuro(l.price)}
          </span>
          <span className="card-price-side">
            {l.priceDrop && (
              <span
                className="chip-drop"
                title={`Price lowered on ${new Date(l.priceDrop.at).toLocaleDateString('es-ES')}`}
              >
                ↓ was {fmtEuro(l.priceDrop.from)}
              </span>
            )}
            {goodValue && (
              <span className="chip-value" title="vs the median €/m² of its own area">
                −{l.valuePct}% vs area
              </span>
            )}
            {eurPerSqm && <span className="card-ppsqm">{eurPerSqm.toLocaleString('es-ES')} €/m²</span>}
          </span>
        </div>
        <a className="card-title" href={l.url} target="_blank" rel="noreferrer">
          {l.title}
        </a>
        {l.constructionStatus && l.constructionStatus !== 'done' && (
          <div className="construction-line">
            🚧 {l.constructionStatus === 'building' ? 'en construcción' : 'en proyecto / sobre plano'}
            {l.delivery && ` · entrega ${l.delivery}`}
          </div>
        )}
        {location && (
          <div className="card-location-row">
            <a
              className="card-location"
              href={mapsUrl(l)}
              target="_blank"
              rel="noreferrer"
              title={`Open "${location}" in Google Maps${l.lat != null ? ' (exact GPS position)' : ''}`}
            >
              📍 {location}
            </a>
            <button
              className={`map-toggle${showMap ? ' open' : ''}`}
              title={showMap ? 'Hide mini-map' : 'Peek at the map without leaving the page'}
              onClick={() => setShowMap(!showMap)}
            >
              🗺
            </button>
          </div>
        )}
        {showMap && (
          <div className="card-map">
            <iframe src={mapsEmbedUrl(l)} loading="lazy" title={`Map: ${location}`} allowFullScreen />
            <a className="card-map-open" href={mapsUrl(l)} target="_blank" rel="noreferrer">
              Open in Google Maps ↗
            </a>
          </div>
        )}
        {isPromo ? (
          <>
            <div className="card-meta">
              <span title="bedrooms across available units">🛏 {range(availUnits.map((u) => u.rooms))}</span>
              <span title="bathrooms">🛁 {range(availUnits.map((u) => u.baths))}</span>
              <span title="surface range">📐 {range(availUnits.map((u) => u.sqm), ' m²')}</span>
              <span title="floors">🏢 {range(availUnits.map((u) => u.floor), 'º')}</span>
              {l.hasElevator === true && <span title="has elevator">⬆ lift</span>}
            </div>
            <div className="units">
              {availUnits.slice(0, 4).map((u, i) => (
                <div key={i} className="unit-row">
                  <span className="unit-price">{u.price ? fmtEuro(u.price) : 'consultar'}</span>
                  <span>
                    {u.rooms ?? '?'}h · {u.baths ?? '?'}b · {u.sqm ?? '?'} m² · {u.floor != null ? `${u.floor}º` : '?'}
                  </span>
                  <span className="unit-type">{u.type ?? ''}</span>
                </div>
              ))}
              {availUnits.length > 4 && <div className="unit-more">+{availUnits.length - 4} more available</div>}
              {soldCount > 0 && <div className="unit-more sold">{soldCount} vendido{soldCount > 1 ? 's' : ''}</div>}
            </div>
          </>
        ) : (
          <div className="card-meta">
            <span title="bedrooms">🛏 {l.rooms ?? '?'}</span>
            <span title="bathrooms">🛁 {l.bathrooms ?? '?'}</span>
            <span title="surface">📐 {l.sqm ? `${l.sqm} m²` : '?'}</span>
            <span title="floor">
              🏢 {l.floor !== null ? (l.floor === 0 ? 'ground' : `${l.floor}º`) : l.isTopFloor ? 'ático' : '?'}
            </span>
            <span title="building year">📅 {l.buildingYear ?? '?'}</span>
            {l.hasElevator === true && <span title="has elevator">⬆ lift</span>}
          </div>
        )}
        {(l.flags.length > 0 || l.ai) && (
          <div className="card-ai">
            {(l.flags.length > 0 || (l.ai?.redFlags.length ?? 0) > 0) && (
              <div className="flags">
                {[...new Set([...l.flags, ...(l.ai?.redFlags ?? [])])].map((f) => (
                  <span key={f} className="flag">
                    ⚠ {f}
                  </span>
                ))}
              </div>
            )}
            {l.ai && <p className="verdict">{l.ai.verdict}</p>}
            {l.ai && (l.ai.pros.length > 0 || l.ai.cons.length > 0) && (
              <details className="ai-details">
                <summary>pros & cons</summary>
                <ul>
                  {l.ai!.pros.map((p) => (
                    <li key={p} className="pro">
                      + {p}
                    </li>
                  ))}
                  {l.ai!.cons.map((c) => (
                    <li key={c} className="con">
                      − {c}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        <div className="card-foot">
          <span className={`src src-${l.source}`}>{l.source}</span>
          <span className="card-foot-right">
            <span className="card-date">seen {new Date(l.firstSeenAt).toLocaleDateString('es-ES')}</span>
            <button
              className="hide-btn"
              title={isHidden ? 'Restore this listing' : 'Not interested — hide from all searches'}
              onClick={() => onToggleHidden(l.id, !isHidden)}
            >
              {isHidden ? '♻ restore' : '✕'}
            </button>
          </span>
        </div>
      </div>
    </article>
  );
}
