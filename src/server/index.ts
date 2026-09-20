import '../env.js';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiStatus, analyzeListings } from '../ai/analyst.js';
import { getSyncStatus, startSync } from './sync.js';
import { getListing, getStats, searchListings, setFavorite, setHidden } from '../db/listings.js';
import { createSearch, deleteSearch, listSearches, markViewed, updateSearch } from '../db/searches.js';
import { ADAPTERS, refreshAll, refreshSource } from '../ingest/run.js';
import { getParser } from '../nl/parser.js';
import type { Filters, SearchRequest } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// API_PORT, not PORT: the browser-preview launcher injects PORT for the web dev server
const PORT = Number(process.env.API_PORT ?? 4000);
const app = express();
app.use(express.json());

// ---- natural-language parsing ----
app.post('/api/parse', (req, res) => {
  const text = String(req.body?.text ?? '');
  const filters = getParser().parse(text);
  res.json({ filters });
});

// ---- listings ----
app.post('/api/listings/search', (req, res) => {
  const body = (req.body ?? {}) as SearchRequest;
  res.json(searchListings(body));
});

app.get('/api/listings/:id', (req, res) => {
  const listing = getListing(Number(req.params.id));
  if (!listing) return void res.status(404).json({ error: 'not found' });
  res.json(listing);
});

app.post('/api/listings/:id/favorite', (req, res) => {
  const on = !!(req.body as { on?: boolean })?.on;
  if (!setFavorite(Number(req.params.id), on)) {
    return void res.status(404).json({ error: 'not found' });
  }
  res.json({ ok: true, on });
});

app.post('/api/listings/:id/hide', (req, res) => {
  const on = !!(req.body as { on?: boolean })?.on;
  if (!setHidden(Number(req.params.id), on)) {
    return void res.status(404).json({ error: 'not found' });
  }
  res.json({ ok: true, on });
});

// ---- saved searches ----
app.get('/api/searches', (_req, res) => {
  res.json(listSearches());
});

app.post('/api/searches', (req, res) => {
  const { name, rawQuery, filters } = req.body as { name?: string; rawQuery?: string; filters: Filters };
  if (!filters || typeof filters !== 'object') {
    return void res.status(400).json({ error: 'filters required' });
  }
  res.json(createSearch(name?.trim() || rawQuery?.slice(0, 60) || 'Unnamed search', rawQuery ?? '', filters));
});

app.put('/api/searches/:id', (req, res) => {
  const updated = updateSearch(Number(req.params.id), req.body ?? {});
  if (!updated) return void res.status(404).json({ error: 'not found' });
  res.json(updated);
});

app.delete('/api/searches/:id', (req, res) => {
  res.json({ deleted: deleteSearch(Number(req.params.id)) });
});

app.post('/api/searches/:id/viewed', (req, res) => {
  markViewed(Number(req.params.id));
  res.json({ ok: true });
});

// ---- AI analyst ----
app.get('/api/ai/status', (_req, res) => {
  res.json(aiStatus());
});

app.post('/api/analyze', async (req, res) => {
  const { filters, rawQuery } = (req.body ?? {}) as { filters?: Filters; rawQuery?: string };
  if (!aiStatus().configured) {
    return void res.status(400).json({ error: aiStatus().hint });
  }
  res.json(await analyzeListings(filters ?? {}, rawQuery ?? ''));
});

// ---- full sync (background job) ----
app.post('/api/sync', (_req, res) => {
  const started = startSync();
  res.status(started ? 202 : 409).json({ started, status: getSyncStatus() });
});

app.get('/api/sync/status', (_req, res) => {
  res.json(getSyncStatus());
});

// ---- data refresh & stats ----
app.post('/api/refresh', async (req, res) => {
  const { source, full, maxPages } = (req.body ?? {}) as {
    source?: string;
    full?: boolean;
    maxPages?: number;
  };
  const opts = { full: !!full, maxPages };
  const summaries = source ? [await refreshSource(source, opts)] : await refreshAll(opts);
  res.json(summaries);
});

app.get('/api/stats', (_req, res) => {
  res.json({ ...getStats(), sourcesAvailable: Object.keys(ADAPTERS) });
});

// ---- static frontend (production build) ----
const webDist = path.resolve(__dirname, '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
