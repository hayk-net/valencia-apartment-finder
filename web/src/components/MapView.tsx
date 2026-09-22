import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fmtEuro } from '../api';
import { approxCoords } from '../areaCoords';
import { locationLabel, mapsUrl } from '../maps';
import type { Listing } from '../types';

interface Props {
  items: Listing[];
}

function priceLabel(p: number): string {
  if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1).replace('.0', '')}M`;
  return `${Math.round(p / 1000)}k`;
}

/** Popup built via DOM APIs — listing titles are scraped text, never raw HTML. */
function buildPopup(l: Listing, approx: boolean): HTMLElement {
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
  const bits = [
    l.rooms != null ? `${l.rooms} hab` : null,
    l.sqm ? `${l.sqm} m²` : null,
    l.floor != null ? `${l.floor === 0 ? 'bajo' : `${l.floor}º`}` : l.isTopFloor ? 'ático' : null,
    l.valuePct != null && l.valuePct >= 8 ? `−${l.valuePct}% vs area` : null,
  ].filter(Boolean);
  meta.textContent = bits.join(' · ');
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
  loc.textContent = `📍 ${locationLabel(l)}${approx ? ' (posición aproximada)' : ''}`;
  root.appendChild(loc);

  return root;
}

export function MapView({ items }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: true }).setView([39.4699, -0.3763], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
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
    for (const l of items) {
      const pos = approxCoords(l);
      if (!pos) continue;
      bounds.push([pos.lat, pos.lng]);

      const cls = ['map-chip'];
      if (pos.approx) cls.push('map-chip-approx');
      if (l.flags.length > 0) cls.push('map-chip-flag');
      if (l.ai && l.ai.score >= 80) cls.push('map-chip-gem');
      const icon = L.divIcon({
        className: 'map-chip-wrap',
        html: `<div class="${cls.join(' ')}" title="${pos.approx ? 'posición aproximada' : ''}">${
          pos.approx ? '≈' : ''
        }${priceLabel(l.price)}</div>`,
        iconSize: [0, 0],
      });
      const marker = L.marker([pos.lat, pos.lng], { icon });
      marker.bindPopup(() => buildPopup(l, pos.approx), { maxWidth: 280 });
      layer.addLayer(marker);
    }
    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 15 });
    }
  }, [items]);

  return <div className="map-view" ref={divRef} />;
}
