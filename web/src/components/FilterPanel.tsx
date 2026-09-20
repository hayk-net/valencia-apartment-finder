import { useEffect, useState } from 'react';
import { filtersToChips, removeChip } from '../chips';
import type { Filters } from '../types';

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
}

function numOrUndef(v: string): number | undefined {
  const n = Number(v);
  return v.trim() === '' || Number.isNaN(n) ? undefined : n;
}

export function FilterPanel({ filters, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(filters);
  useEffect(() => setDraft(filters), [filters]);

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
                placeholder="Russafa, Benimaclet…"
                value={(draft.neighborhoods ?? []).join(', ')}
                onChange={(e) =>
                  set({
                    neighborhoods:
                      e.target.value.trim() === ''
                        ? undefined
                        : e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
            </label>
            <label className="wide">
              Keywords (comma-separated)
              <input
                type="text"
                placeholder="terrace, garage…"
                value={(draft.keywords ?? []).join(', ')}
                onChange={(e) =>
                  set({
                    keywords:
                      e.target.value.trim() === ''
                        ? undefined
                        : e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
            </label>
          </div>
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
                onChange(draft);
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
