import { createOpenAI } from "@core-ai/openai";
import { createAnthropic } from "@core-ai/anthropic";
import { generate, type ChatModel } from "@core-ai/core-ai";
import { config } from "./config.js";
import type { Contact, ParsedInvoice } from "./sevdesk/types.js";

function getModel(): ChatModel {
  if (config.AI_PROVIDER === "anthropic") {
    const anthropic = createAnthropic({ apiKey: config.ANTHROPIC_API_KEY });
    return anthropic.chatModel(config.ANTHROPIC_MODEL);
  }
  const openai = createOpenAI({ apiKey: config.OPENAI_API_KEY });
  return getModel();
}

export async function pickBestContact(
  query: string,
  candidates: Contact[],
  customerContext?: { city?: string; street?: string; zipCode?: string }
): Promise<Contact | null> {
  if (candidates.length === 0) return null;

  const list = candidates
    .map((c, i) => `${i}: ${c.name} (ID: ${c.id})`)
    .join("\n");

  let context = "";
  if (customerContext) {
    const parts = [customerContext.street, customerContext.zipCode, customerContext.city]
      .filter(Boolean);
    if (parts.length > 0) context = `\nCustomer address: ${parts.join(", ")}`;
  }

  const result = await generate({
    model: getModel(),
    messages: [
      {
        role: "user",
        content: `I need to find the company "${query}" in our contacts database. Which contact, if any, is the SAME company?${context}

Candidates:
${list}

Rules:
- The contact must be the SAME company, not just sharing a word (e.g. "Energy Hub" is NOT "NRW.Energy4Climate")
- Ignore legal suffixes (GmbH, AG, etc.) when comparing
- When in doubt, reply -1
- Reply with ONLY the index number (0-based), or -1 if none match`,
      },
    ],
  });

  const match = (result.content ?? "").match(/-?\d+/);
  const idx = match ? parseInt(match[0], 10) : NaN;
  if (isNaN(idx) || idx < 0 || idx >= candidates.length) return null;
  return candidates[idx];
}

export async function parseInvoiceText(text: string): Promise<ParsedInvoice> {
  const today = new Date().toISOString().split("T")[0];

  const result = await generate({
    model: getModel(),
    messages: [
      {
        role: "system",
        content: `You extract invoice data from German text. Return ONLY valid JSON matching this schema:

{
  "customer": {
    "city": string,
    "street": string,
    "zipCode": string,
    "companyName": string,
    "companyDomain": string  // guess from company name if not given, or ""
  },
  "document": {
    "quoteDate": "DD.MM.YYYY",      // use ${today} if not specified
    "acceptanceDate": "DD.MM.YYYY"   // use ${today} if not specified
  },
  "financials": {
    "vatRate": number,              // 19 for DE, 0 for non-DE/reverse-charge
    "totalContractValueNet": number // total net value
  },
  "oneTimeLineItems": [
    { "flatPrice": number, "productName": string }
  ],
  "recurringLineItems": [
    {
      "seats": number,
      "startDate": "DD.MM.YYYY",
      "productName": string,
      "runtimeMonths": number,
      "pricePerSeatPerMonth": number
    }
  ],
  "contactPerson": string | null,  // name of contact person if mentioned, null if not
  "email": string | null           // email for e-Rechnung if mentioned, null if not
}

Rules:
- Default vatRate to 19 for German companies, 0 for non-DE or explicit reverse-charge
- If only a total is given with no line items, put it as a single oneTimeLineItem
- Dates in DD.MM.YYYY format
- Return ONLY the JSON, no markdown fences or explanation`,
      },
      {
        role: "user",
        content: text,
      },
    ],
  });

  const raw = (result.content ?? "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    console.error("[parseInvoiceText] No JSON object in LLM response:\n", raw);
    throw new Error("No JSON object in LLM response");
  }
  const jsonStr = raw.slice(start, end + 1);
  try {
    return JSON.parse(jsonStr) as ParsedInvoice;
  } catch (err) {
    console.error("[parseInvoiceText] Failed to parse LLM response:\n", raw);
    throw err;
  }
}
