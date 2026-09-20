import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { filtersToChips } from './chips';
import { FilterPanel } from './components/FilterPanel';
import { ListingCard } from './components/ListingCard';
import { Sidebar } from './components/Sidebar';
import type { AiStatus, Filters, Listing, SavedSearch, SortKey, Stats } from './types';

const SORT_LABELS: Record<SortKey, string> = {
  gem: '✨ Gems first',
  newest: 'Newest first',
  price_asc: 'Price ↑',
  price_desc: 'Price ↓',
  sqm_desc: 'Biggest first',
  eur_per_sqm: 'Cheapest €/m²',
};

type Category = 'all' | 'resale' | 'new' | 'future' | 'atico';

const CATEGORY_LABELS: Record<Category, string> = {
  all: 'Everything',
  resale: 'Resale',
  new: '🏗 Obra nueva',
  future: '🚧 Sobre plano',
  atico: '☀️ Áticos',
};

function loadSavedSort(): SortKey {
  try {
    const s = localStorage.getItem('realtor.sort');
    if (s && ['gem', 'newest', 'price_asc', 'price_desc', 'sqm_desc', 'eur_per_sqm'].includes(s)) {
      return s as SortKey;
    }
  } catch {
    /* private mode etc. */
  }
  return 'newest';
}

export default function App() {
  const [rawQuery, setRawQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortKey>(loadSavedSort);
  const [results, setResults] = useState<{ items: Listing[]; total: number }>({ items: [], total: 0 });
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [active, setActive] = useState<{ id: number; newSince: string | null } | null>(null);
  const [view, setView] = useState<'all' | 'fav' | 'hidden'>('all');
  const [busy, setBusy] = useState(false);
  const [busyMore, setBusyMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncLine, setSyncLine] = useState<string | null>(null);
  const [aiInfo, setAiInfo] = useState<AiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const syncPoll = useRef<number | null>(null);

  const runSearch = useCallback(async (f: Filters, s: SortKey) => {
    const seq = ++searchSeq.current;
    setBusy(true);
    try {
      const r = await api.search(f, s);
      if (seq === searchSeq.current) setResults(r);
      setError(null);
    } catch (e) {
      setError(`Search failed: ${(e as Error).message}`);
    } finally {
      if (seq === searchSeq.current) setBusy(false);
    }
  }, []);

  const reloadMeta = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([api.searches(), api.stats()]);
      setSearches(s);
      setStats(st);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const watchSync = useCallback(() => {
    if (syncPoll.current !== null) return;
    setSyncing(true);
    const tick = async () => {
      try {
        const s = await api.syncStatus();
        setSyncLine(s.log[s.log.length - 1] ?? 'syncing…');
        if (!s.running) {
          if (syncPoll.current !== null) window.clearInterval(syncPoll.current);
          syncPoll.current = null;
          setSyncing(false);
          await reloadMeta();
        }
      } catch {
        /* server briefly unavailable — keep polling */
      }
    };
    syncPoll.current = window.setInterval(tick, 4000);
    void tick();
  }, [reloadMeta]);

  useEffect(() => {
    void runSearch({}, loadSavedSort());
    void reloadMeta();
    api.aiStatus().then(setAiInfo).catch(() => setAiInfo(null));
    // resume progress display if a sync is already running (e.g. after a reload)
    api.syncStatus().then((s) => s.running && watchSync()).catch(() => {});
  }, [runSearch, reloadMeta, watchSync]);

  const handleSync = async () => {
    try {
      await api.startSync();
      setSyncLine('⇄ sync started — fetching every source, this takes a while…');
      watchSync();
    } catch (e) {
      setError(`Sync failed to start: ${(e as Error).message}`);
    }
  };

  const FAV_FILTERS: Filters = { onlyFavorites: true };
  const HIDDEN_FILTERS: Filters = { onlyHidden: true };
  const currentFilters = () =>
    view === 'fav' ? FAV_FILTERS : view === 'hidden' ? HIDDEN_FILTERS : filters;

  const category: Category = filters.topFloorOnly
    ? 'atico'
    : filters.futureOnly
      ? 'future'
      : filters.newBuildOnly
        ? 'new'
        : filters.resaleOnly
          ? 'resale'
          : 'all';

  const setCategory = (c: Category) => {
    const next: Filters = { ...filters };
    delete next.newBuildOnly;
    delete next.resaleOnly;
    delete next.topFloorOnly;
    delete next.futureOnly;
    if (c === 'new') next.newBuildOnly = true;
    if (c === 'resale') next.resaleOnly = true;
    if (c === 'atico') next.topFloorOnly = true;
    if (c === 'future') next.futureOnly = true;
    applyFilters(next);
  };

  const applyFilters = (f: Filters) => {
    setView('all');
    setFilters(f);
    void runSearch(f, sort);
  };

  const handleParse = async () => {
    if (!rawQuery.trim()) return;
    try {
      const { filters: parsed } = await api.parse(rawQuery);
      setActive(null);
      applyFilters(parsed);
    } catch (e) {
      setError(`Parse failed: ${(e as Error).message}`);
    }
  };

  const handleSort = (s: SortKey) => {
    setSort(s);
    try {
      localStorage.setItem('realtor.sort', s);
    } catch {
      /* fine */
    }
    void runSearch(currentFilters(), s);
  };

  const showFavorites = () => {
    setView('fav');
    setActive(null);
    void runSearch(FAV_FILTERS, sort);
  };

  const showHidden = () => {
    setView('hidden');
    setActive(null);
    void runSearch(HIDDEN_FILTERS, sort);
  };

  const toggleHidden = async (id: number, on: boolean) => {
    // dismissing removes the card from the current list right away
    setResults((r) => ({
      total: Math.max(0, r.total - 1),
      items: r.items.filter((i) => i.id !== id),
    }));
    try {
      await api.setHidden(id, on);
      setStats(await api.stats());
    } catch (e) {
      setError(`Could not ${on ? 'hide' : 'restore'} listing: ${(e as Error).message}`);
    }
  };

  const showAll = () => {
    setView('all');
    setActive(null);
    setRawQuery('');
    setFilters({});
    void runSearch({}, sort);
  };

  const toggleFavorite = async (id: number, on: boolean) => {
    // optimistic flip; the fav view keeps the card visible until reload
    setResults((r) => ({
      ...r,
      items: r.items.map((i) => (i.id === id ? { ...i, favoritedAt: on ? new Date().toISOString() : null } : i)),
    }));
    try {
      await api.setFavorite(id, on);
      setStats(await api.stats());
    } catch (e) {
      setError(`Could not save favorite: ${(e as Error).message}`);
    }
  };

  const loadMore = async () => {
    setBusyMore(true);
    try {
      const more = await api.search(currentFilters(), sort, 60, results.items.length);
      setResults((r) => ({ total: more.total, items: [...r.items, ...more.items] }));
    } catch (e) {
      setError(`Load more failed: ${(e as Error).message}`);
    } finally {
      setBusyMore(false);
    }
  };

  const handleSave = async () => {
    const label = filtersToChips(filters).map((c) => c.label).join(' · ');
    const name = (label || rawQuery.slice(0, 60) || 'All listings').trim();
    const created = await api.createSearch(name, rawQuery, filters);
    setActive({ id: created.id, newSince: null });
    await reloadMeta();
  };

  const handleSelect = async (s: SavedSearch) => {
    setView('all');
    setRawQuery(s.rawQuery);
    setFilters(s.filters);
    setActive({ id: s.id, newSince: s.lastViewedAt });
    void runSearch(s.filters, sort);
    await api.markViewed(s.id);
    setSearches(await api.searches());
  };

  const handleDelete = async (s: SavedSearch) => {
    if (!window.confirm(`Delete saved search "${s.name}"?`)) return;
    await api.deleteSearch(s.id);
    if (active?.id === s.id) setActive(null);
    await reloadMeta();
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const s = await api.analyze(currentFilters(), view === 'fav' ? '' : rawQuery);
      const cost = s.costUsd != null ? ` · ~$${s.costUsd.toFixed(2)}` : '';
      const failed = s.failed > 0 ? ` · ${s.failed} failed${s.error ? ` (${s.error})` : ''}` : '';
      setError(
        `✨ Analyzed ${s.analyzed} listings with ${s.model} (${s.cached} already scored)${cost}${failed}`,
      );
      setSort('gem');
      void runSearch(currentFilters(), 'gem');
    } catch (e) {
      setError(`Analyze failed: ${(e as Error).message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const summaries = await api.refresh();
      const line = summaries
        .map((s) => (s.ok ? `${s.source}: +${s.added} new, ${s.priceChanges} price changes` : `${s.source}: ${s.error}`))
        .join(' | ');
      setError(line); // reusing the banner as a status line
      await reloadMeta();
      void runSearch(currentFilters(), sort);
    } catch (e) {
      setError(`Refresh failed: ${(e as Error).message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const chipsCount = filtersToChips(filters).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg className="brand-icon" viewBox="0 0 40 40" width="34" height="34" aria-label="Valencia skyline">
            <rect x="2" y="17" width="10" height="21" rx="1.5" fill="#6FA8C9" />
            <rect x="14" y="7" width="12" height="31" rx="1.5" fill="#14537F" />
            <rect x="28" y="21" width="10" height="17" rx="1.5" fill="#2E86AB" />
            <g fill="#EAF4FA">
              <rect x="4.5" y="20" width="2" height="2" />
              <rect x="8" y="20" width="2" height="2" />
              <rect x="4.5" y="24" width="2" height="2" />
              <rect x="8" y="24" width="2" height="2" />
              <rect x="4.5" y="28" width="2" height="2" />
              <rect x="16.5" y="10" width="2.4" height="2.4" />
              <rect x="21" y="10" width="2.4" height="2.4" />
              <rect x="16.5" y="15" width="2.4" height="2.4" />
              <rect x="21" y="15" width="2.4" height="2.4" />
              <rect x="16.5" y="20" width="2.4" height="2.4" />
              <rect x="21" y="20" width="2.4" height="2.4" />
              <rect x="16.5" y="25" width="2.4" height="2.4" />
              <rect x="21" y="25" width="2.4" height="2.4" />
              <rect x="30.5" y="24" width="2" height="2" />
              <rect x="34" y="24" width="2" height="2" />
              <rect x="30.5" y="28" width="2" height="2" />
              <rect x="34" y="28" width="2" height="2" />
            </g>
          </svg>
          <div>
            <h1>Valencia Apartment Finder</h1>
            <span className="brand-sub">
              {stats ? `${stats.totalActive.toLocaleString('es-ES')} active listings · ${stats.sources.map((s) => `${s.source} ${s.active}`).join(' · ')}` : '…'}
            </span>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="btn"
            disabled={analyzing || !aiInfo?.configured}
            onClick={handleAnalyze}
            title={
              aiInfo?.configured
                ? `Score the listings matching your current filters with Claude (${aiInfo.model})`
                : aiInfo?.hint ?? 'AI analyst not configured'
            }
          >
            {analyzing ? '✨ Analyzing…' : '✨ Find gems'}
          </button>
          <button
            className="btn"
            disabled={refreshing || syncing}
            onClick={handleRefresh}
            title="Quick top-up: newest pages of every source (~1-2 min)"
          >
            {refreshing ? 'Refreshing…' : '⟳ Quick refresh'}
          </button>
          <button
            className="btn btn-primary"
            disabled={syncing}
            onClick={handleSync}
            title="Full sync: fetch ALL listings from every source — adds new, updates existing, removes vanished ones (~15-25 min, runs in background)"
          >
            {syncing ? '⇄ Syncing…' : '⇄ Sync all'}
          </button>
        </div>
      </header>
      {syncLine && (
        <div className="syncbar" onClick={() => !syncing && setSyncLine(null)}>
          {syncing ? '⏳ ' : ''}
          {syncLine}
        </div>
      )}

      <div className="layout">
        <Sidebar
          searches={searches}
          activeId={active?.id ?? null}
          canSave={chipsCount > 0}
          favCount={stats?.favorites ?? 0}
          favActive={view === 'fav'}
          hiddenCount={stats?.hidden ?? 0}
          hiddenActive={view === 'hidden'}
          onFavorites={showFavorites}
          onHidden={showHidden}
          onSave={handleSave}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onClear={showAll}
        />

        <main className="main">
          {view === 'fav' ? (
            <div className="fav-head">
              <h2>♥ Favorites</h2>
              <p>Everything you've hearted — including listings that later vanished from their portal (marked GONE).</p>
            </div>
          ) : view === 'hidden' ? (
            <div className="fav-head">
              <h2>🚫 Hidden</h2>
              <p>Listings you dismissed — they never appear in searches. Restore any that deserve a second chance.</p>
            </div>
          ) : (
            <>
              <div className="searchbar">
                <input
                  type="text"
                  value={rawQuery}
                  placeholder='Describe it in English — e.g. "3 bedroom 2 bathroom, max 50 years old building, 100 sqm, not more than 330K euros, above 3rd floor"'
                  onChange={(e) => setRawQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleParse()}
                />
                <button className="btn btn-primary" onClick={handleParse}>
                  Search
                </button>
              </div>

              <FilterPanel filters={filters} onChange={applyFilters} />

              <div className="cats">
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                  <button
                    key={c}
                    className={`cat${category === c ? ' cat-active' : ''}`}
                    onClick={() => setCategory(c)}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && (
            <div className="banner" onClick={() => setError(null)}>
              {error}
            </div>
          )}

          <div className="toolbar">
            <span className="toolbar-count">
              {busy ? 'Searching…' : `${results.total.toLocaleString('es-ES')} listings`}
            </span>
            <label className="toolbar-sort">
              Sort
              <select value={sort} onChange={(e) => handleSort(e.target.value as SortKey)}>
                {Object.entries(SORT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {busy && results.items.length === 0 ? (
            <div className="grid">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="card skeleton">
                  <div className="sk-media" />
                  <div className="card-body">
                    <div className="sk-line w60" />
                    <div className="sk-line w90" />
                    <div className="sk-line w40" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid">
              {results.items.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  newSince={active?.newSince ?? null}
                  onToggleFavorite={toggleFavorite}
                  onToggleHidden={toggleHidden}
                />
              ))}
            </div>
          )}
          {!busy && results.items.length === 0 && (
            <div className="empty">
              <p>
                {view === 'fav'
                  ? 'No favorites yet — heart a listing (♡ on its photo) and it lands here.'
                  : view === 'hidden'
                    ? 'Nothing hidden — dismiss listings with the ✕ on their card.'
                    : 'No listings match. Loosen a filter, or hit "⟳ Quick refresh" to fetch the latest.'}
              </p>
            </div>
          )}
          {results.total > results.items.length && (
            <div className="load-more">
              <button className="btn" disabled={busyMore} onClick={loadMore}>
                {busyMore ? 'Loading…' : `Load more (${results.items.length} of ${results.total.toLocaleString('es-ES')})`}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
