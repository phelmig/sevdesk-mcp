import { createOpenAI } from "@core-ai/openai";
import { generate } from "@core-ai/core-ai";
import { config } from "./config.js";
import type { Contact, ParsedInvoice } from "./sevdesk/types.js";

const openai = createOpenAI({ apiKey: config.OPENAI_API_KEY });

export async function pickBestContact(
  query: string,
  candidates: Contact[]
): Promise<Contact | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const list = candidates
    .map((c, i) => `${i}: ${c.name} (ID: ${c.id})`)
    .join("\n");

  const result = await generate({
    model: openai.chatModel(config.OPENAI_MODEL),
    messages: [
      {
        role: "user",
        content: `Given the search query "${query}", which of these contacts is the best match? Reply with ONLY the index number (0-based).\n\n${list}`,
      },
    ],
  });

  const idx = parseInt((result.content ?? "").trim(), 10);
  if (isNaN(idx) || idx < 0 || idx >= candidates.length) return candidates[0];
  return candidates[idx];
}

export async function parseInvoiceText(text: string): Promise<ParsedInvoice> {
  const today = new Date().toISOString().split("T")[0];

  const result = await generate({
    model: openai.chatModel(config.OPENAI_MODEL),
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
  "contactPerson": string | undefined,  // name of contact person if mentioned
  "email": string | undefined           // email for e-Rechnung if mentioned
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
  // Strip markdown fences if present
  const json = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  return JSON.parse(json) as ParsedInvoice;
}
