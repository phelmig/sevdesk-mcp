# SevDesk API Wrapper

Express API wrapping SevDesk for fuzzy customer search, invoice creation from quotes, and invoice reporting. Includes an MCP (Model Context Protocol) endpoint for AI agent access.

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
ENABLE_MCP=true
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

## MCP Endpoint

Enabled by default at `POST /mcp`. Uses [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) (stateless, single endpoint). Requires the same `Authorization: Bearer <API_KEY>` header.

### Tools

| Tool | Description |
|------|-------------|
| `search_contacts` | Fuzzy substring search for contacts — returns all matches. Strips legal suffixes (GmbH, AG, etc.) and falls back to first-word search. |
| `search_contact` | Same fuzzy search but returns the single best match using AI disambiguation. |
| `get_invoices` | List invoices with optional `startDate`, `endDate`, and `status` filters. |
| `get_invoices_by_contact` | List invoices for a specific company (resolved via `search_contact`). |

### Response format

MCP tool responses are optimized for AI agents — compact JSON with only the fields an agent needs.

**Contacts** return `id`, `name`, `customerNumber`, `description` (optional fields omitted when empty). Internal fields like `objectName` and `category` are stripped.

**Invoices** return `id`, `invoiceNumber`, `status`, `invoiceDate`, `sumNet`, `sumGross`, `contactName`. Status codes are mapped to labels: `100` → `"draft"`, `200` → `"open"`, `1000` → `"paid"`. The `url` field is omitted (constructable from id).

### Test with curl

```bash
# Initialize
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer dev" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# List tools
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer dev" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call a tool
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer dev" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_contacts","arguments":{"query":"Sportsgoods"}}}'
```

### Claude Desktop / MCP client config

```json
{
  "mcpServers": {
    "sevdesk": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer dev"
      }
    }
  }
}
```

## Web UI

Enabled by default at `http://localhost:3000/`. Terminal-style interface with tabs for searching contacts, creating invoices, and listing invoices.

## Project Structure

```
src/
├── config.ts                # env config
├── index.ts                 # express app
├── mcp.ts                   # MCP server + tool definitions
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
