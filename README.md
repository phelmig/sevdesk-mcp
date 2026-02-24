# SevDesk API Wrapper

Express API wrapping SevDesk for fuzzy customer search, invoice creation from quotes, and invoice reporting.

## Setup

```bash
npm install
cp .env.example .env  # fill in your keys
```

**.env**
```
SEVDESK_API_KEY=...
OPENAI_API_KEY=...
API_KEY=dev            # bearer token for this service
PORT=3000
ENABLE_WEB_UI=true
```

## Run

```bash
npm run dev    # tsx watch
npm run build  # tsc → dist/
npm start      # node dist/index.js
```

## API

All endpoints require `Authorization: Bearer <API_KEY>`.

### Health

```
GET /api/health
```

### Search Contact

```
GET /api/contacts/search?q=Wohnstätten Siegen
```

Strips legal suffixes (GmbH, eG, etc.), searches SevDesk contacts, uses GPT-4o-mini to pick the best match when ambiguous.

### List Invoices

```
GET /api/invoices?startDate=2026-01-01&endDate=2026-12-31&status=200
GET /api/invoices?contactQuery=Wohnstätten&startDate=2026-01-01
```

| Param | Description |
|-------|-------------|
| `startDate` | Filter from date (YYYY-MM-DD) |
| `endDate` | Filter to date (YYYY-MM-DD) |
| `status` | `100` Draft, `200` Open, `1000` Paid |
| `contactQuery` | Fuzzy company name → filters by resolved contact |

### Create Invoice

```
POST /api/invoices
Content-Type: application/json

{ ...quote JSON... }
```

Accepts the quote format from `example_quote.json`. Creates a **draft** invoice (status 100) with:
- Recurring items: `seats × runtimeMonths × pricePerSeatPerMonth` per line
- One-time items: `flatPrice` per line
- Contact resolved via fuzzy search
- Contact person set to first SevUser
- Tax rule: standard German VAT (19%)

## Web UI

Enabled by default at `http://localhost:3000/`. Terminal-style interface with tabs for searching contacts, creating invoices, and listing invoices.

## Project Structure

```
src/
├── config.ts                # env config
├── index.ts                 # express app
├── llm.ts                   # gpt-4o-mini fuzzy matching
├── middleware/auth.ts        # bearer auth
├── sevdesk/
│   ├── client.ts            # SevDesk HTTP client
│   ├── contacts.ts          # contact search + fuzzy match
│   ├── invoices.ts          # invoice CRUD
│   └── types.ts             # TypeScript types
├── routes/
│   ├── contacts.ts
│   ├── invoices.ts
│   └── health.ts
└── web/index.html           # test UI
```
