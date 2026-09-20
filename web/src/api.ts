import type {
  AiStatus,
  AnalyzeSummary,
  Filters,
  Listing,
  RefreshSummary,
  SavedSearch,
  SortKey,
  Stats,
  SyncState,
} from './types';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  parse: (text: string) =>
    json<{ filters: Filters }>('/api/parse', { method: 'POST', body: JSON.stringify({ text }) }),

  search: (filters: Filters, sort: SortKey, limit = 60, offset = 0) =>
    json<{ items: Listing[]; total: number }>('/api/listings/search', {
      method: 'POST',
      body: JSON.stringify({ filters, sort, limit, offset }),
    }),

  setFavorite: (id: number, on: boolean) =>
    json<{ ok: boolean; on: boolean }>(`/api/listings/${id}/favorite`, {
      method: 'POST',
      body: JSON.stringify({ on }),
    }),

  setHidden: (id: number, on: boolean) =>
    json<{ ok: boolean; on: boolean }>(`/api/listings/${id}/hide`, {
      method: 'POST',
      body: JSON.stringify({ on }),
    }),

  searches: () => json<SavedSearch[]>('/api/searches'),

  createSearch: (name: string, rawQuery: string, filters: Filters) =>
    json<SavedSearch>('/api/searches', { method: 'POST', body: JSON.stringify({ name, rawQuery, filters }) }),

  renameSearch: (id: number, name: string) =>
    json<SavedSearch>(`/api/searches/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),

  deleteSearch: (id: number) => json<{ deleted: boolean }>(`/api/searches/${id}`, { method: 'DELETE' }),

  markViewed: (id: number) => json<{ ok: boolean }>(`/api/searches/${id}/viewed`, { method: 'POST' }),

  refresh: (source?: string) =>
    json<RefreshSummary[]>('/api/refresh', { method: 'POST', body: JSON.stringify({ source }) }),

  stats: () => json<Stats>('/api/stats'),

  aiStatus: () => json<AiStatus>('/api/ai/status'),

  startSync: () => json<{ started: boolean; status: SyncState }>('/api/sync', { method: 'POST' }),

  syncStatus: () => json<SyncState>('/api/sync/status'),

  analyze: (filters: Filters, rawQuery: string) =>
    json<AnalyzeSummary>('/api/analyze', { method: 'POST', body: JSON.stringify({ filters, rawQuery }) }),
};

export function fmtEuro(n: number): string {
  return n.toLocaleString('es-ES') + ' €';
}
