import { createOpenAI } from "@core-ai/openai";
import { generate } from "@core-ai/core-ai";
import { config } from "./config.js";
import type { Contact } from "./sevdesk/types.js";

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
