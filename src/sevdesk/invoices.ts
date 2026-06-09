import { get, post } from "./client.js";
import { searchContact, createContact, addEmailToContact } from "./contacts.js";
import type { ParsedInvoice, Quote } from "./types.js";
import { templates, resolveTemplate, classifyLineItem } from "../templates.js";

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


function buildLineItems(quote: Quote) {
  const items: any[] = [];
  let posIdx = 0;

  for (const item of quote.recurringLineItems) {
    const category = classifyLineItem(item.productName);
    const tpl = templates.lineItemText[category];
    const start = parseDate(item.startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + item.runtimeMonths);
    const duration = item.runtimeMonths === 1 ? "1 Monat" : `${item.runtimeMonths} Monate`;
    const text = resolveTemplate(tpl, {
      duration,
      startDate: formatDE(start),
      endDate: formatDE(end),
    });

    const itemName = category === "license"
      ? `${item.productName} ${duration}`
      : item.productName;

    items.push({
      objectName: "InvoicePos",
      mapAll: true,
      quantity: item.seats,
      price: item.pricePerSeatPerMonth * item.runtimeMonths,
      name: itemName,
      text,
      unity: { id: "1", objectName: "Unity" },
      taxRate: quote.financials.vatRate,
      positionNumber: posIdx++,
    });
  }

  for (const item of quote.oneTimeLineItems) {
    items.push({
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

  return items;
}

async function getDefaultSevUser(): Promise<string> {
  const res = await get("/SevUser", {});
  const users = res.objects ?? [];
  if (users.length === 0) throw new Error("No SevUser found");
  return users[0].id;
}

async function getSepaPaymentMethod(): Promise<{ id: string; objectName: string } | null> {
  const res = await get("/PaymentMethod", {});
  const methods = res.objects ?? [];
  const sepa = methods.find((m: any) =>
    /sepa|überweisung/i.test(m.name)
  );
  return sepa ? { id: sepa.id, objectName: "PaymentMethod" } : null;
}

export async function createInvoiceFromQuote(
  quote: Quote,
  opts?: { eRechnung?: boolean }
) {
  let contact = await searchContact(quote.customer.companyName, quote.customer);
  if (!contact) {
    contact = await createContact(quote.customer);
  }

  const [sevUserId, paymentMethod] = await Promise.all([
    getDefaultSevUser(),
    getSepaPaymentMethod(),
  ]);
  const invoicePosSave = buildLineItems(quote);
  const today = new Date().toISOString().split("T")[0];

  const invoice: Record<string, any> = {
    objectName: "Invoice",
    mapAll: true,
    invoiceNumber: null,
    contact: { id: contact.id, objectName: "Contact" },
    contactPerson: { id: sevUserId, objectName: "SevUser" },
    invoiceDate: today,
    discount: 0,
    status: 100,
    addressName: quote.customer.companyName,
    addressStreet: quote.customer.street ?? "",
    addressZip: quote.customer.zipCode ?? "",
    addressCity: quote.customer.city ?? "",
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
    ...(paymentMethod && { paymentMethod }),
  };

  if (opts?.eRechnung) {
    invoice.propertyIsEInvoice = true;
  }

  return post("/Invoice/Factory/saveInvoice", { invoice, invoicePosSave });
}

export async function dryRunInvoice(input: ParsedInvoice | Quote) {
  const parsed = input as ParsedInvoice;
  const existingContact = await searchContact(input.customer.companyName, input.customer);
  const lineItems = buildLineItems(input);

  const summary = lineItems.map((li: any) => ({
    name: li.name,
    text: li.text,
    quantity: li.quantity,
    unitPrice: li.price,
    totalNet: li.quantity * li.price,
    taxRate: li.taxRate,
  }));

  const totalNet = summary.reduce((s: number, li: any) => s + li.totalNet, 0);
  const totalGross = summary.reduce(
    (s: number, li: any) => s + li.totalNet * (1 + li.taxRate / 100),
    0
  );

  return {
    dryRun: true,
    actions: {
      contact: existingContact
        ? { action: "use_existing", name: existingContact.name, id: existingContact.id }
        : { action: "create_new", customer: input.customer },
      email: parsed.email
        ? { action: "add_email", email: parsed.email }
        : null,
    },
    invoice: {
      header: `Rechnung – ${input.customer.companyName}`,
      eRechnung: !!parsed.email,
      timeToPay: templates.timeToPay,
      lineItems: summary,
      totalNet,
      totalGross,
    },
  };
}

export async function createInvoiceFromText(parsed: ParsedInvoice) {
  let contact = await searchContact(parsed.customer.companyName, parsed.customer);
  if (!contact) {
    contact = await createContact(parsed.customer);
  }

  if (parsed.email) {
    await addEmailToContact(contact.id, parsed.email);
  }

  return createInvoiceFromQuote(parsed, { eRechnung: !!parsed.email });
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
