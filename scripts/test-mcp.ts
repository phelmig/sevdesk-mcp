/**
 * End-to-end test for the MCP text-to-invoice workflow.
 *
 * Usage (dev server must be running — `npm run dev`):
 *   npm run test:mcp                 # list tools, parse text, dry-run preview (no invoice created)
 *   npm run test:mcp -- --create     # additionally create a real draft invoice in SevDesk
 *   MCP_URL=... API_KEY=... npm run test:mcp   # override endpoint/auth
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.MCP_URL ?? "http://localhost:3000/mcp";
const API_KEY = process.env.API_KEY ?? "dev";
const doCreate = process.argv.includes("--create");

const SAMPLE_TEXT =
  "Rechnung an Testfirma Beispiel GmbH, Beispielstraße 42, 10115 Berlin. " +
  "3 Lizenzen Product Pro à 20€/Monat für 6 Monate ab 01.09.2026, " +
  "außerdem einmalig 500€ Onboarding. " +
  "Ansprechpartner Erika Musterfrau, Rechnung per E-Mail an erika@beispiel.de";

function section(title: string) {
  console.log(`\n${"=".repeat(60)}\n${title}\n${"=".repeat(60)}`);
}

/** Extract and parse the JSON text payload from an MCP tool result */
function toolResultJson(result: any): any {
  const text = result?.content?.find((c: any) => c.type === "text")?.text;
  if (!text) throw new Error(`No text content in tool result: ${JSON.stringify(result)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text; // not JSON (e.g. "Contact not found")
  }
}

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
  });
  const client = new Client({ name: "mcp-test-script", version: "1.0.0" });
  await client.connect(transport);
  console.log(`Connected to ${MCP_URL}`);

  // ── 1. List tools ──────────────────────────────────────────
  section("1. tools/list");
  const { tools } = await client.listTools();
  for (const t of tools) console.log(`  • ${t.name}`);

  // ── 2. parse_invoice_text ──────────────────────────────────
  section("2. parse_invoice_text");
  console.log(`Input text:\n  ${SAMPLE_TEXT}\n`);
  const parseResult = await client.callTool({
    name: "parse_invoice_text",
    arguments: { text: SAMPLE_TEXT },
  });
  const parsed = toolResultJson(parseResult);
  console.log("Parsed structure:");
  console.log(JSON.stringify(parsed, null, 2));

  // ── 3. create_invoice (dry run) ────────────────────────────
  section("3. create_invoice (dryRun: true)");
  const dryResult = await client.callTool({
    name: "create_invoice",
    arguments: { ...parsed, dryRun: true },
  });
  console.log(JSON.stringify(toolResultJson(dryResult), null, 2));

  // ── 4. create_invoice (real) ───────────────────────────────
  if (doCreate) {
    section("4. create_invoice (REAL — creating draft invoice)");
    const createResult = await client.callTool({
      name: "create_invoice",
      arguments: { ...parsed },
    });
    console.log(JSON.stringify(toolResultJson(createResult), null, 2));
  } else {
    section("4. create_invoice (skipped)");
    console.log("Run with --create to actually create the draft invoice in SevDesk.");
  }

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nTest failed:", err.message ?? err);
  process.exit(1);
});
