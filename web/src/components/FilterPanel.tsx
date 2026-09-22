import { useEffect, useState } from 'react';
import { filtersToChips, removeChip } from '../chips';
import type { Filters } from '../types';

interface Props {
  filters: Filters;
  sourcesAvailable: string[];
  onChange: (f: Filters) => void;
}

function numOrUndef(v: string): number | undefined {
  const n = Number(v);
  return v.trim() === '' || Number.isNaN(n) ? undefined : n;
}

function parseList(s: string): string[] | undefined {
  const items = s.split(',').map((x) => x.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function FilterPanel({ filters, sourcesAvailable, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(filters);
  // free-typed text lives in its own state and is parsed only on Apply —
  // parsing per keystroke used to eat trailing commas and spaces as you typed
  const [areasText, setAreasText] = useState('');
  const [kwText, setKwText] = useState('');
  useEffect(() => {
    setDraft(filters);
    setAreasText((filters.neighborhoods ?? []).join(', '));
    setKwText((filters.keywords ?? []).join(', '));
  }, [filters]);

  const chips = filtersToChips(filters);

  const set = (patch: Partial<Filters>) => setDraft({ ...draft, ...patch });
  const num = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set({ [key]: numOrUndef(e.target.value) } as Partial<Filters>);

  return (
    <div className="filter-panel">
      <div className="chips">
        {chips.length === 0 && <span className="chips-empty">No filters — showing everything</span>}
        {chips.map((c) => (
          <span key={c.key} className="chip">
            {c.label}
            <button className="chip-x" title="Remove filter" onClick={() => onChange(removeChip(filters, c.key))}>
              ×
            </button>
          </span>
        ))}
        <button className="chip-adjust" onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Adjust filters'}
        </button>
      </div>

      {open && (
        <div className="adjust">
          <div className="adjust-grid">
            <label>
              Bedrooms min
              <input type="number" min={0} value={draft.minRooms ?? ''} onChange={num('minRooms')} />
            </label>
            <label>
              Bedrooms max
              <input type="number" min={0} value={draft.maxRooms ?? ''} onChange={num('maxRooms')} />
            </label>
            <label>
              Bathrooms min
              <input type="number" min={0} value={draft.minBathrooms ?? ''} onChange={num('minBathrooms')} />
            </label>
            <label>
              Floor min
              <input type="number" min={0} value={draft.minFloor ?? ''} onChange={num('minFloor')} />
            </label>
            <label>
              Price min €
              <input type="number" step={10000} value={draft.minPrice ?? ''} onChange={num('minPrice')} />
            </label>
            <label>
              Price max €
              <input type="number" step={10000} value={draft.maxPrice ?? ''} onChange={num('maxPrice')} />
            </label>
            <label>
              m² min
              <input type="number" value={draft.minSqm ?? ''} onChange={num('minSqm')} />
            </label>
            <label>
              m² max
              <input type="number" value={draft.maxSqm ?? ''} onChange={num('maxSqm')} />
            </label>
            <label>
              Max age (years)
              <input type="number" value={draft.maxBuildingAgeYears ?? ''} onChange={num('maxBuildingAgeYears')} />
            </label>
            <label>
              Built after
              <input type="number" placeholder="1990" value={draft.minBuildingYear ?? ''} onChange={num('minBuildingYear')} />
            </label>
            <label className="wide">
              Areas (comma-separated)
              <input
                type="text"
                placeholder="Russafa, Benimaclet, Carrer de Cullera…"
                value={areasText}
                onChange={(e) => setAreasText(e.target.value)}
              />
            </label>
            <label className="wide">
              Keywords (comma-separated)
              <input
                type="text"
                placeholder="terrace, garage…"
                value={kwText}
                onChange={(e) => setKwText(e.target.value)}
              />
            </label>
          </div>
          {sourcesAvailable.length > 0 && (
            <div className="adjust-sources">
              <span className="adjust-sources-label">Sources:</span>
              {sourcesAvailable.map((s) => {
                const selected = new Set(draft.sources ?? sourcesAvailable);
                const checked = selected.has(s);
                return (
                  <label key={s}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) selected.add(s);
                        else selected.delete(s);
                        set({
                          sources:
                            selected.size === 0 || selected.size === sourcesAvailable.length
                              ? undefined
                              : [...selected],
                        });
                      }}
                    />
                    {s}
                  </label>
                );
              })}
            </div>
          )}
          <div className="adjust-checks">
            <label>
              <input
                type="checkbox"
                checked={!!draft.mustHaveElevator}
                onChange={(e) => set({ mustHaveElevator: e.target.checked || undefined })}
              />
              elevator required
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!draft.newBuildOnly}
                onChange={(e) => set({ newBuildOnly: e.target.checked || undefined })}
              />
              new build only
            </label>
            <label title="Many listings don't state the floor — keep them visible with a ? badge">
              <input
                type="checkbox"
                checked={draft.includeUnknownFloor !== false}
                onChange={(e) => set({ includeUnknownFloor: e.target.checked ? undefined : false })}
              />
              include unknown floor
            </label>
            <label title="Most listings don't state the building year — keep them visible with a ? badge">
              <input
                type="checkbox"
                checked={draft.includeUnknownYear !== false}
                onChange={(e) => set({ includeUnknownYear: e.target.checked ? undefined : false })}
              />
              include unknown year
            </label>
          </div>
          <div className="adjust-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                onChange({ ...draft, neighborhoods: parseList(areasText), keywords: parseList(kwText) });
                setOpen(false);
              }}
            >
              Apply
            </button>
            <button className="btn" onClick={() => setDraft(filters)}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
