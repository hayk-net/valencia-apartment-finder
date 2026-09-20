import { now } from '../db/index.js';
import { ADAPTERS, refreshSource } from '../ingest/run.js';
import type { RefreshSummary } from '../types.js';

/**
 * Full sync = the user's mental model: fetch EVERYTHING from every source,
 * add the new, update the existing, deactivate what disappeared.
 * A polite full sweep takes ~15-25 min, so it runs as a background job the
 * UI polls — never as one blocking HTTP request.
 */

export interface SyncState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  currentSource: string | null;
  log: string[];
  summaries: RefreshSummary[];
}

const state: SyncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  currentSource: null,
  log: [],
  summaries: [],
};

export function getSyncStatus(): SyncState {
  return state;
}

export function startSync(): boolean {
  if (state.running) return false;
  state.running = true;
  state.startedAt = now();
  state.finishedAt = null;
  state.log = [];
  state.summaries = [];

  void (async () => {
    for (const name of Object.keys(ADAPTERS)) {
      state.currentSource = name;
      state.log.push(`⇄ syncing ${name}… (full sweep)`);
      try {
        const s = await refreshSource(name, { full: true, enrichLimit: 40 });
        state.summaries.push(s);
        state.log.push(
          s.ok
            ? `${name}: ${s.found} found · +${s.added} new · ${s.updated} updated · ${s.priceChanges} price changes · ${s.deactivated} gone${s.warning ? ` · ⚠ ${s.warning}` : ''}`
            : `${name} FAILED: ${s.error}`,
        );
      } catch (err) {
        state.log.push(`${name} ERROR: ${(err as Error).message}`);
      }
    }
    state.currentSource = null;
    state.running = false;
    state.finishedAt = now();
    state.log.push('✓ sync complete');
  })();

  return true;
}
