# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Local development (Vercel serverless emulation)
vercel dev

# Deploy to production
npm run deploy
# or: vercel --prod
```

There is no test runner configured. The file `lib/transformers/test.json` appears to be ad-hoc test data.

## Required Environment Variables

```
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
DEEPSEEK_API_TOKEN=your_deepseek_token
```

## Architecture

This is a Node.js ES Modules serverless microservice deployed on Vercel. The single endpoint `POST /api/analyze` accepts `{ city, regionCode }` and returns an AI-generated real estate investment analysis for Dutch regions.

### ETL + AI Pipeline

The request flow follows a self-healing ETL pattern:

1. **Cache check** — `analysis:cache:{regionCode}` in Upstash Redis (7-day TTL). Returns immediately on hit.
2. **Data completeness check** (`ensureAndFetchFeatures`) — detects missing feature keys in Redis.
3. **Extract** — `lib/scraper.js` calls CBS (Dutch Statistics Bureau) OData API; `lib/upload_traffic_data.js` loads local `data/traffic_data.json` (24MB). Raw data stored as `raw:{category}:{regionCode}`.
4. **Transform** — Four parallel transformers in `lib/transformers/` compute domain-specific feature sets stored as `features:{category}:{regionCode}`.
5. **AI Analysis** — All features merged into a JSON payload sent to DeepSeek-V3 (`deepseek-chat`). Response is forced to JSON format via `response_format: { type: "json_object" }`.
6. **Cache result** — Analysis stored with 7-day TTL.

### Transformer Interface

Each transformer in `lib/transformers/` exports a `save*Features(regionCode)` function that:
- Reads from `raw:{category}:{regionCode}` in Redis
- Computes metrics (YoY growth, volatility, ratios, safety index, etc.)
- Writes to `features:{category}:{regionCode}` in Redis
- Returns the computed feature object

| Transformer | Key metrics computed |
|---|---|
| `housing.js` | Avg price, YoY/10yr growth, volatility, ai_signal |
| `population.js` | Education ratio, household composition, income, urban level, facility distances |
| `safety.js` | Crime per 1k inhabitants, solve rate, safety index (100 - crime rate) |
| `traffic.js` | Commute efficiency (km/min), trip duration — uses PV27 (North Holland) provincial proxy |

### Data Sources

- **CBS OData API** (`opendata.cbs.nl`) — table IDs configured in `lib/config.js` for housing, population, safety
- **Local file** — `data/traffic_data.json` (CBS mobility data, PV27 province proxy since municipal-level unavailable)
- **Redis key namespace**: `raw:*`, `features:*`, `analysis:cache:*`

### Region Code Format

Dutch CBS region codes are passed as `regionCode` in requests (e.g., municipal codes like `GM0363` for Amsterdam, provincial `PV27` for North Holland). Traffic data always uses the PV27 provincial proxy regardless of requested municipality.
