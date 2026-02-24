import "dotenv/config";

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export const config = {
  SEVDESK_API_KEY: required("SEVDESK_API_KEY"),
  OPENAI_API_KEY: required("OPENAI_API_KEY"),
  API_KEY: process.env.API_KEY ?? "dev",
  PORT: parseInt(process.env.PORT ?? "3000", 10),
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-5-mini",
  ENABLE_WEB_UI: process.env.ENABLE_WEB_UI !== "false",
  ENABLE_MCP: process.env.ENABLE_MCP !== "false",
};
