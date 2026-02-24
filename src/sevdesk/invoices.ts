import { get, post } from "./client.js";
import { searchContact } from "./contacts.js";
import type { Invoice, Quote } from "./types.js";
import templates from "../invoice-templates.json" with { type: "json" };

/** Convert YYYY-MM-DD to unix timestamp string (SevDesk requires this) */
function toTimestamp(dateStr: string): string {
  const ts = Math.floor(new Date(dateStr).getTime() / 1000);
  return String(ts);
}

/** Parse DD.MM.YYYY into Date, or YYYY-MM-DD */
function parseDate(s: string): Date {
  const dotMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotMatch) return new Date(+dotMatch[3], +dotMatch[2] - 1, +dotMatch[1]);
  return new Date(s);
}

/** Format Date as DD.MM.YYYY */
function formatDE(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Resolve {{ var }} placeholders in a template string */
function resolveTemplate(
  tpl: string,
  vars: Record<string, string | number>
): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    String(vars[key] ?? `{{ ${key} }}`)
  );
}

/** Classify a recurring line item product name */
function classifyLineItem(productName: string): "aiUsage" | "license" {
  const lower = productName.toLowerCase();
  if (lower.includes("fair-use") || lower.includes("budget")) return "aiUsage";
  return "license";
}

async function getDefaultSevUser(): Promise<string> {
  const res = await get("/SevUser", {});
  const users = res.objects ?? [];
  if (users.length === 0) throw new Error("No SevUser found");
  return users[0].id;
}

export async function createInvoiceFromQuote(quote: Quote) {
  // Resolve contact
  const contact = await searchContact(quote.customer.companyName);
  if (!contact) {
    throw new Error(`Contact not found: ${quote.customer.companyName}`);
  }

  const sevUserId = await getDefaultSevUser();

  // Build line items
  const invoicePosSave: any[] = [];
  let posIdx = 0;

  for (const item of quote.recurringLineItems) {
    const category = classifyLineItem(item.productName);
    const tpl = templates.lineItemText[category];
    const start = parseDate(item.startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + item.runtimeMonths);
    const text = resolveTemplate(tpl, {
      monthNum: item.runtimeMonths,
      startDate: formatDE(start),
      endDate: formatDE(end),
    });

    invoicePosSave.push({
      objectName: "InvoicePos",
      mapAll: true,
      quantity: item.seats,
      price: item.pricePerSeatPerMonth * item.runtimeMonths,
      name: item.productName,
      text,
      unity: { id: "1", objectName: "Unity" },
      taxRate: quote.financials.vatRate,
      positionNumber: posIdx++,
    });
  }

  for (const item of quote.oneTimeLineItems) {
    invoicePosSave.push({
      objectName: "InvoicePos",
      mapAll: true,
      quantity: 1,
      price: item.flatPrice,
      name: item.productName,
      unity: { id: "1", objectName: "Unity" },
      taxRate: quote.financials.vatRate,
      positionNumber: posIdx++,
    });
  }

  // Build invoice
  const today = new Date().toISOString().split("T")[0];

  const body = {
    invoice: {
      objectName: "Invoice",
      mapAll: true,
      invoiceNumber: null, // auto-generate
      contact: { id: contact.id, objectName: "Contact" },
      contactPerson: { id: sevUserId, objectName: "SevUser" },
      invoiceDate: today,
      discount: 0,
      status: 100, // Draft
      addressCountry: { id: 1, objectName: "StaticCountry" },
      taxRate: 0,
      taxRule: { id: "1", objectName: "TaxRule" },
      taxText: "Umsatzsteuer 19%",
      taxType: "default",
      invoiceType: "RE",
      currency: "EUR",
      timeToPay: templates.timeToPay,
      header: `Rechnung – ${quote.customer.companyName}`,
      headText: templates.headText,
      footText: templates.footText,
    },
    invoicePosSave,
  };

  return post("/Invoice/Factory/saveInvoice", body);
}

export async function getInvoices(
  startDate?: string,
  endDate?: string,
  status?: string
) {
  const params: Record<string, string> = {};
  if (startDate) params["startDate"] = toTimestamp(startDate);
  if (endDate) params["endDate"] = toTimestamp(endDate);
  if (status) params["status"] = status;
  params["limit"] = "100";
  params["embed"] = "contact";

  const res = await get("/Invoice", params);
  return (res.objects ?? []).map((inv: any) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    invoiceDate: inv.invoiceDate,
    sumNet: inv.sumNet,
    sumGross: inv.sumGross,
    contactName: inv.contact?.name ?? "Unknown",
    url: `https://my.sevdesk.de/fi/edit/type/RE/id/${inv.id}`,
  }));
}

export async function getInvoicesByContact(
  contactQuery: string,
  startDate?: string,
  endDate?: string
) {
  const contact = await searchContact(contactQuery);
  if (!contact) throw new Error(`Contact not found: ${contactQuery}`);

  const params: Record<string, string> = {
    "contact[id]": contact.id,
    "contact[objectName]": "Contact",
    limit: "100",
    embed: "contact",
  };
  if (startDate) params["startDate"] = toTimestamp(startDate);
  if (endDate) params["endDate"] = toTimestamp(endDate);

  const res = await get("/Invoice", params);
  return (res.objects ?? []).map((inv: any) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    invoiceDate: inv.invoiceDate,
    sumNet: inv.sumNet,
    sumGross: inv.sumGross,
    contactName: inv.contact?.name ?? contact.name,
    url: `https://my.sevdesk.de/fi/edit/type/RE/id/${inv.id}`,
  }));
}
