# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server with tsx watch (auto-reload)
npm run build        # tsc → dist/
npm start            # run production build (node dist/index.js)
npm test             # run tests (node:test via tsx)
```

Tests use Node's built-in test runner (`node:test`) via tsx. No linter is configured.

## Environment

Requires `.env` with `SEVDESK_API_KEY` and an LLM provider key (see `.env.example`). Set `AI_PROVIDER=openai` (default) or `AI_PROVIDER=anthropic` to switch between OpenAI and Anthropic. Only the selected provider's API key is required. The `API_KEY` env var (default `"dev"`) is the Bearer token for all API and MCP requests.

## Architecture

Express server (`src/index.ts`) exposing three surfaces from the same process:

1. **REST API** (`/api/*`) — routes in `src/routes/`, all behind Bearer auth middleware
2. **MCP endpoint** (`POST /mcp`) — stateless Streamable HTTP transport, tools defined in `src/mcp.ts`
3. **Web UI** (`GET /`) — single static HTML file (`src/web/index.html`)

Both REST and MCP are enabled by default; toggled via `ENABLE_MCP` / `ENABLE_WEB_UI` env vars.

### SevDesk integration (`src/sevdesk/`)

- `client.ts` — thin HTTP wrapper around `https://my.sevdesk.de/api/v1`. Auth is the raw API key in the `Authorization` header (no `Bearer` prefix — that's how SevDesk works).
- `contacts.ts` — fuzzy contact search: strips legal suffixes (GmbH, AG, etc.), queries SevDesk substring search, falls back to first-word search. Can also create contacts with addresses and email communication ways.
- `invoices.ts` — invoice creation from structured `Quote` objects or free-text (via LLM parsing). Dates are converted to unix timestamps for SevDesk. Line item templates default to `src/invoice-templates.json` (`{{ var }}` placeholders), overridden by `invoice-templates.local.json` in the project root if present.
- `types.ts` — shared TypeScript interfaces (`Contact`, `Invoice`, `Quote`, `ParsedInvoice`)

### LLM layer (`src/llm.ts`)

Uses `@core-ai/core-ai` with swappable providers (`@core-ai/openai` or `@core-ai/anthropic`). Two functions:
- `pickBestContact` — disambiguates multiple contact search results
- `parseInvoiceText` — extracts structured `ParsedInvoice` from German free-text

Provider is selected via `AI_PROVIDER` env var (`openai` or `anthropic`). Model is configurable via `OPENAI_MODEL` (default: `gpt-5-mini`) or `ANTHROPIC_MODEL` (default: `claude-sonnet-4-6`).

### MCP tools

Defined in `src/mcp.ts`. Each request creates a fresh `McpServer` + `StreamableHTTPServerTransport` (stateless, no sessions). MCP responses are slimmed down — only fields useful to AI agents, status codes mapped to labels (`100` → `"draft"`).

### Invoice creation flow

`POST /api/invoices` routes to either `createInvoiceFromQuote` (structured JSON matching `Quote` type) or `createInvoiceFromText` (has `email` or `contactPerson` field → LLM-parsed). Both auto-create the SevDesk contact if fuzzy search finds no match. See `example_quote.json` for the expected input shape.

`POST /api/invoices/from-text` is a separate endpoint that only parses free-text into structured data (does not create the invoice).

## Conventions

- ESM throughout (`"type": "module"` in package.json). Imports use `.js` extensions even for `.ts` source files.
- SevDesk category ID `"3"` = organization contacts (filtered in search results).
- All invoices are created as draft (status `100`).
- German locale: invoice templates, date format `DD.MM.YYYY`, VAT defaults to 19%.
