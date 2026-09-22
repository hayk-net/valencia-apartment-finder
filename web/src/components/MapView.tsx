import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fmtEuro } from '../api';
import { resolveMapPos } from '../areaCoords';
import { locationLabel, mapsUrl } from '../maps';
import type { Listing } from '../types';

interface Props {
  items: Listing[];
  /** "filter this area" button in area popups */
  onAreaFilter?: (areaName: string) => void;
}

function priceLabel(p: number): string {
  if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1).replace('.0', '')}M`;
  return `${Math.round(p / 1000)}k`;
}

/** Popups are built via DOM APIs — listing titles are scraped text, never raw HTML. */
function buildListingPopup(l: Listing): HTMLElement {
  const root = document.createElement('div');
  root.className = 'map-popup';

  const price = document.createElement('div');
  price.className = 'map-popup-price';
  price.textContent = `${l.units?.length ? 'desde ' : ''}${fmtEuro(l.price)}`;
  root.appendChild(price);

  const title = document.createElement('a');
  title.className = 'map-popup-title';
  title.href = l.url;
  title.target = '_blank';
  title.rel = 'noreferrer';
  title.textContent = l.title;
  root.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'map-popup-meta';
  meta.textContent = [
    l.rooms != null ? `${l.rooms} hab` : null,
    l.sqm ? `${l.sqm} m²` : null,
    l.floor != null ? (l.floor === 0 ? 'bajo' : `${l.floor}º`) : l.isTopFloor ? 'ático' : null,
    l.valuePct != null && l.valuePct >= 8 ? `−${l.valuePct}% vs area` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  root.appendChild(meta);

  if (l.flags.length > 0) {
    const flags = document.createElement('div');
    flags.className = 'map-popup-flags';
    flags.textContent = `⚠ ${l.flags.join(', ')}`;
    root.appendChild(flags);
  }

  const loc = document.createElement('a');
  loc.className = 'map-popup-loc';
  loc.href = mapsUrl(l);
  loc.target = '_blank';
  loc.rel = 'noreferrer';
  loc.textContent = `📍 ${locationLabel(l)}`;
  root.appendChild(loc);

  return root;
}

function buildAreaPopup(
  name: string,
  items: Listing[],
  onAreaFilter?: (name: string) => void,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'map-popup';

  const head = document.createElement('div');
  head.className = 'map-popup-price';
  head.textContent = `≈ ${name} — ${items.length} listing${items.length > 1 ? 's' : ''}`;
  root.appendChild(head);

  const note = document.createElement('div');
  note.className = 'map-popup-meta';
  note.textContent = 'approximate area — these sources publish no exact position';
  root.appendChild(note);

  const best = [...items].sort(
    (a, b) => (b.valuePct ?? -999) - (a.valuePct ?? -999) || a.price - b.price,
  );
  const list = document.createElement('div');
  list.className = 'map-popup-list';
  for (const l of best.slice(0, 8)) {
    const row = document.createElement('a');
    row.className = 'map-popup-row';
    row.href = l.url;
    row.target = '_blank';
    row.rel = 'noreferrer';
    const vp = l.valuePct != null && l.valuePct >= 8 ? ` · −${l.valuePct}%` : '';
    row.textContent = `${fmtEuro(l.price)} · ${l.rooms ?? '?'}h · ${l.sqm ?? '?'}m²${vp} — ${l.title.slice(0, 42)}`;
    if (l.flags.length > 0) row.classList.add('flagged');
    list.appendChild(row);
  }
  root.appendChild(list);

  if (items.length > 8) {
    const more = document.createElement('div');
    more.className = 'map-popup-meta';
    more.textContent = `+${items.length - 8} more in this area`;
    root.appendChild(more);
  }

  if (onAreaFilter) {
    const btn = document.createElement('button');
    btn.className = 'map-popup-btn';
    btn.textContent = `Filter listings in ${name}`;
    btn.addEventListener('click', () => onAreaFilter(name));
    root.appendChild(btn);
  }

  return root;
}

export function MapView({ items, onAreaFilter }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: true }).setView([39.4699, -0.3763], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // zoomed out → area bubbles shrink to "≈N" badges so barrios don't overlap
    const syncCompact = () => {
      wrapRef.current?.classList.toggle('map-compact', map.getZoom() < 14);
    };
    map.on('zoomend', syncCompact);
    syncCompact();
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds: L.LatLngTuple[] = [];
    let exactCount = 0;
    let unmapped = 0;
    const areas = new Map<string, { name: string; lat: number; lng: number; items: Listing[] }>();

    for (const l of items) {
      const pos = resolveMapPos(l);
      if (pos.kind === 'none') {
        unmapped++;
        continue;
      }
      if (pos.kind === 'area') {
        let g = areas.get(pos.key);
        if (!g) {
          // display name: the nicest real spelling we saw for this area
          const name = l.neighborhood ?? l.municipality ?? pos.key;
          areas.set(pos.key, (g = { name, lat: pos.lat, lng: pos.lng, items: [] }));
        }
        g.items.push(l);
        continue;
      }
      exactCount++;
      bounds.push([pos.lat, pos.lng]);
      const cls = ['map-chip'];
      if (l.flags.length > 0) cls.push('map-chip-flag');
      if (l.ai && l.ai.score >= 80) cls.push('map-chip-gem');
      const icon = L.divIcon({
        className: 'map-chip-wrap',
        html: `<div class="${cls.join(' ')}">${priceLabel(l.price)}</div>`,
        iconSize: [0, 0],
      });
      const marker = L.marker([pos.lat, pos.lng], { icon });
      marker.bindPopup(() => buildListingPopup(l), { maxWidth: 280 });
      layer.addLayer(marker);
    }

    // one honest bubble per area instead of a fake pile of chips
    for (const g of areas.values()) {
      bounds.push([g.lat, g.lng]);
      const minPrice = Math.min(...g.items.map((i) => i.price));
      const icon = L.divIcon({
        className: 'map-chip-wrap',
        html: `<div class="map-area" title="≈ ${g.name} — approximate area">≈<span class="ma-name"> ${g.name} ·</span> ${g.items.length}<span class="ma-name map-area-desde">desde ${priceLabel(minPrice)}</span></div>`,
        iconSize: [0, 0],
      });
      const marker = L.marker([g.lat, g.lng], { icon, zIndexOffset: 500 });
      marker.bindPopup(() => buildAreaPopup(g.name, g.items, onAreaFilter), { maxWidth: 320 });
      layer.addLayer(marker);
    }

    if (legendRef.current) {
      legendRef.current.textContent = `${exactCount} exact pins · ${areas.size} area bubbles (≈ approximate)${
        unmapped > 0 ? ` · ${unmapped} without location — list view only` : ''
      }`;
    }
    if (bounds.length > 0) {
      // fit the Valencia metro core by default — a single far listing
      // (Sagunto…) must not zoom the whole map out into a clump
      const CENTER: L.LatLngTuple = [39.4699, -0.3763];
      const near = bounds.filter(
        ([lat, lng]) => Math.abs(lat - CENTER[0]) < 0.09 && Math.abs(lng - CENTER[1]) < 0.11,
      );
      map.fitBounds(L.latLngBounds(near.length >= 3 ? near : bounds), {
        padding: [30, 30],
        maxZoom: 15,
      });
    }
  }, [items, onAreaFilter]);

  return (
    <div className="map-wrap" ref={wrapRef}>
      <div className="map-view" ref={divRef} />
      <div className="map-legend" ref={legendRef} />
    </div>
  );
}
