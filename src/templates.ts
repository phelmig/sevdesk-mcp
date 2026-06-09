import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import defaultTemplates from "./invoice-templates.json" with { type: "json" };

export interface InvoiceTemplates {
  timeToPay: number;
  headText: string;
  footText: string;
  lineItemText: Record<string, string>;
}

export function loadTemplates(cwd = process.cwd()): InvoiceTemplates {
  const localPath = join(cwd, "invoice-templates.local.json");
  if (existsSync(localPath)) {
    return JSON.parse(readFileSync(localPath, "utf-8"));
  }
  return defaultTemplates as InvoiceTemplates;
}

export function resolveTemplate(
  tpl: string,
  vars: Record<string, string | number>
): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    String(vars[key] ?? `{{ ${key} }}`)
  );
}

export function classifyLineItem(productName: string): "aiUsage" | "license" {
  const lower = productName.toLowerCase();
  if (lower.includes("fair-use") || lower.includes("budget")) return "aiUsage";
  return "license";
}

export const templates = loadTemplates();
