import "dotenv/config";

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

const AI_PROVIDER = (process.env.AI_PROVIDER ?? "openai") as "openai" | "anthropic";

export const config = {
  SEVDESK_API_KEY: required("SEVDESK_API_KEY"),
  AI_PROVIDER,
  OPENAI_API_KEY: AI_PROVIDER === "openai" ? required("OPENAI_API_KEY") : process.env.OPENAI_API_KEY ?? "",
  ANTHROPIC_API_KEY: AI_PROVIDER === "anthropic" ? required("ANTHROPIC_API_KEY") : process.env.ANTHROPIC_API_KEY ?? "",
  API_KEY: process.env.API_KEY ?? "dev",
  PORT: parseInt(process.env.PORT ?? "3000", 10),
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-5-mini",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  ENABLE_WEB_UI: process.env.ENABLE_WEB_UI !== "false",
  ENABLE_MCP: process.env.ENABLE_MCP !== "false",
};
