import type { SavedSearch } from '../types';

interface Props {
  searches: SavedSearch[];
  activeId: number | null;
  canSave: boolean;
  favCount: number;
  favActive: boolean;
  hiddenCount: number;
  hiddenActive: boolean;
  onFavorites: () => void;
  onHidden: () => void;
  onSave: () => void;
  onSelect: (s: SavedSearch) => void;
  onDelete: (s: SavedSearch) => void;
  onClear: () => void;
}

export function Sidebar({
  searches,
  activeId,
  canSave,
  favCount,
  favActive,
  hiddenCount,
  hiddenActive,
  onFavorites,
  onHidden,
  onSave,
  onSelect,
  onDelete,
  onClear,
}: Props) {
  return (
    <aside className="sidebar">
      <button className={`fav-entry${favActive ? ' active' : ''}`} onClick={onFavorites}>
        <span>♥ Favorites</span>
        <span className="fav-count">{favCount}</span>
      </button>

      <div className="sidebar-head">
        <h2>Saved searches</h2>
        <button className="btn btn-small" disabled={!canSave} title={canSave ? 'Save current filters' : 'Set some filters first'} onClick={onSave}>
          + Save current
        </button>
      </div>
      {searches.length === 0 && (
        <p className="sidebar-empty">
          Type what you're looking for above, then save it here. Saved searches remember your criteria and show how
          many new listings appeared since your last visit.
        </p>
      )}
      <ul className="search-list">
        {searches.map((s) => (
          <li key={s.id} className={s.id === activeId ? 'active' : ''}>
            <button className="search-item" onClick={() => onSelect(s)}>
              <span className="search-name">{s.name}</span>
              <span className="search-counts">
                {s.matchCount ?? 0} {s.matchCount === 1 ? 'match' : 'matches'}
                {(s.newCount ?? 0) > 0 && <span className="search-new">{s.newCount} new</span>}
              </span>
            </button>
            <button className="search-del" title="Delete saved search" onClick={() => onDelete(s)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button className={`hidden-entry${hiddenActive ? ' active' : ''}`} onClick={onHidden}>
          🚫 Hidden ({hiddenCount})
        </button>
      )}
      {(activeId !== null || favActive || hiddenActive) && (
        <button className="btn btn-small btn-ghost" onClick={onClear}>
          ← All listings
        </button>
      )}
    </aside>
  );
}
