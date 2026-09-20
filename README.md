# Valencia Apartment Finder

Self-hosted apartment hunter for **buying in Valencia, Spain**. It pulls listings from
the big portals, new-build aggregators, developer catalogues and cooperative project
sites into one local database, lets you search it in **plain English**, and ranks
results by a "gem score" designed around one idea:

> A gem is what you're looking for, in your price range but **cheaper than it should
> be** — or the same price as its peers but in a better area, or renovated.
> The cheapest listings are usually the *worst* ones (auctions, squatted buildings,
> bare ownership). Cheapest ≠ gem.

Everything runs on your own machine. Nothing is uploaded anywhere.

---

## Features

- **English search** → editable filter chips: *"3 bedroom 2 bathroom, max 50 years old
  building, 100 sqm, not more than 330K euros, above 3rd floor"* just works. Saved
  searches remember criteria and show **NEW** badges since your last visit.
- **Gem ranking**, two layers:
  - *Statistical (always on)*: every listing gets `−N% vs area` — its €/m² against the
    median of its own neighborhood. Discounts of ~5–30% are the sweet spot; discounts
    beyond ~40% are treated as a **warning**, not a bargain.
  - *AI analyst (optional)*: with an Anthropic API key, **✨ Find gems** has Claude read
    every Spanish description against your criteria — score 0–100, one-line verdict,
    pros/cons, red flags. Results are cached and re-scored only when price or criteria
    change.
- **Trap detection**: structured red flags straight from source data — *nuda propiedad*
  (bare ownership), *ocupada* (squatted), *subasta* (auction), *alquilada con inquilino*
  (sitting tenant) — shown as ⚠ chips and hard-capped to the bottom of the ranking.
- **Categories**: Everything · Resale · 🏗 Obra nueva · **🚧 Sobre plano** (future
  projects: under construction / pre-construction, with construction status and
  delivery dates on the card) · ☀️ Áticos.
- **Valencia city first**: capital listings always rank above province/metro towns.
- **Floor extraction that actually works**: Spanish posters bury the floor in the
  description ("4ª planta", "ático", "tercer piso") — a floor-grammar parser plus
  detail-page enrichment recovers it; houses are correctly excluded from floor filters.
- **New developments as unit tables**: promotions show their real typology rows
  (price · habs · baños · m² · **planta** · tipo), "desde" pricing, sold counts.
- **Quality-of-life**: ♥ favorites (survive delisting — marked GONE), ✕ hide
  ("not interested", excluded from every search, restorable), price-drop chips
  ("↓ was 350.000 €"), Google Maps links (exact GPS where sources provide it) with
  in-card mini-maps, load-more pagination, remembered sort.

## Where the data comes from

| Source | What | Method |
|---|---|---|
| [Fotocasa](https://www.fotocasa.es) | ~3.7k resale + new listings, Valencia capital | embedded state-JSON on search pages — floors, GPS, full descriptions, structured red flags |
| [Habitaclia](https://www.habitaclia.com) | ~3.5k listings, Valencia capital | server-rendered HTML, newest-first; floor/year enriched from detail pages |
| [viviendasnuevas.com](https://viviendasnuevas.com) | new-build ("obra nueva") aggregator | promo pages: typology tables, status, delivery (price-on-request promos skipped) |
| [Metrovacesa](https://metrovacesa.com) | national developer catalogue | embedded JSON — construction phase + delivery dates; unpriced promos appear once priced |
| [FICSA](https://ficsa.es) | Valencia-local developer | detail pages state price range and construction progress % |
| Direct projects / cooperativas | one-off project sites (cooperatives price ~15% under market) | registry in `src/sources/proyectos.ts` — **found a project site? add one line** |
| [thinkSPAIN](https://www.thinkspain.com) | English-language portal | top listings only (their pagination is JS-walled) |
| Idealista | the #1 portal | **pending**: official free API (apply at [developers.idealista.com](https://developers.idealista.com/access-request)); the site itself is DataDome-walled |

**Sync semantics** (⇄ Sync all): full sweep of every source — adds new listings,
updates existing ones (recording every price change), deactivates vanished ones.
A safety guard refuses to deactivate anything when a sweep saw less than half of a
source's inventory (transient blocks must never empty the database).
**⟳ Quick refresh** grabs just the newest pages (~1–2 min).

**Etiquette**: single-file requests, 2.5 s between them (configurable), cool-off retry
on errors, personal use only, nothing republished. Be a good neighbor — this is one
person looking for a home, and the request volume should look exactly like that.

## Cold start

Prereqs: **Node ≥ 20.12** (developed on 24), npm.

```bash
git clone <your-repo-url> Realtor && cd Realtor
npm install            # installs web/ dependencies too (postinstall)
npm run dev            # API on :4000, app on http://localhost:5173
```

The database starts **empty** (it's local data, never committed). To fill it:

1. Open http://localhost:5173
2. Click **⇄ Sync all** — a full sweep of every source takes ~15–25 min politely and
   runs in the background with live progress. Or click **⟳ Quick refresh** for a
   fast first taste (~2 min, newest listings only).
3. Optional instant gratification while you wait: `npm run seed` inserts 24 sample
   listings (`npm run seed -- --clear` removes them).

The DB is a single file: `data/realtor.db`. Delete it to start over.

## Configuration

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | enables **✨ Find gems** (Claude analyst). Get one at console.anthropic.com |
| `REALTOR_AI_MODEL` | default `claude-opus-5`; `claude-haiku-4-5` is ~5× cheaper |
| `REALTOR_AI_EFFORT` | `low` / `medium` (default) / `high` |
| `IDEALISTA_API_KEY` / `IDEALISTA_SECRET` | for the Idealista adapter once your API application is approved |
| `REALTOR_DELAY_MS` | politeness delay between requests (default 2500) |
| `REALTOR_DATA_DIR` / `REALTOR_DB` | relocate the data directory / DB file |

Without any `.env` the app is fully functional — the AI button just stays disabled.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | dev mode: API :4000 + hot-reload web app :5173 |
| `npm run build` && `npm start` | production: one process serving app + API on :4000 (`API_PORT` to change) |
| `npm run refresh` | quick top-up of all sources (+ floor/year enrichment) |
| `npm run refresh -- --source=fotocasa --full` | full sweep of one source |
| `npm run refresh -- --pages=3 --dry-run` | parse and print, write nothing |
| `npm run refresh -- --enrich-only=100` | just extract floor/year from stored text + detail pages |
| `npm run seed` / `npm run seed -- --clear` | add / remove sample listings |
| `npm test` | test suite (English parser, Spanish floor grammar, gem ranking, value stats) |
| `npm run mcp` | MCP server — placeholder; it's a learning project built by hand |

## Always-on hosting (macOS)

Run it permanently with launchd so the app is just *there* at a fixed port, refreshing
itself. Create `~/Library/LaunchAgents/com.<you>.valencia-finder.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.you.valencia-finder</string>
  <key>ProgramArguments</key>
  <array><string>/usr/local/bin/node</string><string>dist/server/index.js</string></array>
  <key>WorkingDirectory</key><string>/path/to/Realtor</string>
  <key>EnvironmentVariables</key><dict><key>API_PORT</key><string>4321</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/path/to/Realtor/data/logs/server.log</string>
  <key>StandardErrorPath</key><string>/path/to/Realtor/data/logs/server-error.log</string>
</dict>
</plist>
```

```bash
npm run build
mkdir -p data/logs
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.you.valencia-finder.plist
# app now lives at http://localhost:4321, starts at login, restarts on crash

# after code changes:
npm run build && launchctl kickstart -k gui/$(id -u)/com.you.valencia-finder
# uninstall:
launchctl bootout gui/$(id -u)/com.you.valencia-finder
```

Two optional sibling agents keep data fresh by calling the server's own API on a
schedule (single DB writer, no contention) — `StartCalendarInterval` + `curl -X POST
http://localhost:4321/api/refresh` daily, and `…/api/sync` weekly.

## Architecture

```
src/
├── db/          SQLite (better-sqlite3, WAL) — schema, filters→SQL, price history
├── nl/          English → structured Filters (rule-based; Claude parser pluggable)
├── sources/     one adapter per site, all implementing SourceAdapter
├── ingest/      refresh runner (upsert + price history + deactivation guard),
│                floor/year enrichment, CLI
├── ai/          value baselines (€/m² medians per area), gem heuristic,
│                Claude batch analyst (structured outputs, cached per listing)
├── server/      Express JSON API + static frontend + background sync job
└── mcp/         MCP server placeholder (learning project)
web/             Vite + React SPA
data/realtor.db  the single source of truth (gitignored)
```

Adding a source = one file implementing `SourceAdapter` (`fetch({full}) →
ScrapedListing[]`) registered in `src/ingest/run.ts`. For one-off project websites,
skip even that: add a line to the registry in `src/sources/proyectos.ts`.

## Fair use

This is a personal tool for one person's home search. The portals' terms generally
prohibit scraping; this project stays deliberately low-volume, identifies as a normal
browser, keeps everything local and republishes nothing. Don't turn it into a service.

## Roadmap

- **Idealista** via official API (application pending — free, ~100 req/month)
- **MCP server** exposing the DB to Claude ("any new 3-beds under 330K this week?")
- **Catastro enrichment**: Spain's free cadastre API → building year by address
- Cross-portal dedupe (same flat listed on several portals)
- Map view (Leaflet), metro-area expansion of portal sweeps
