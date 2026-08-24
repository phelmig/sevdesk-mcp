import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { searchContacts, searchContact } from "./sevdesk/contacts.js";
import {
  getInvoices,
  getInvoicesByContact,
  createInvoiceFromQuote,
  createInvoiceFromText,
  dryRunInvoice,
} from "./sevdesk/invoices.js";
import { parseInvoiceText } from "./llm.js";
import type { Contact } from "./sevdesk/types.js";
import type { Request, Response } from "express";

const STATUS_LABELS: Record<string, string> = {
  "100": "draft",
  "200": "open",
  "1000": "paid",
};

function formatContactForMcp(c: Contact) {
  return {
    id: c.id,
    name: c.name,
    ...(c.customerNumber && { customerNumber: c.customerNumber }),
    ...(c.description && { description: c.description }),
  };
}

function formatInvoiceForMcp(inv: {
  id: string;
  invoiceNumber: string;
  status: string;
  invoiceDate: string;
  sumNet: string;
  sumGross: string;
  contactName: string;
}) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: STATUS_LABELS[inv.status] ?? inv.status,
    invoiceDate: inv.invoiceDate,
    sumNet: inv.sumNet,
    sumGross: inv.sumGross,
    contactName: inv.contactName,
  };
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "ag-sevdesk",
    version: "1.0.0",
    description:
      "Access SevDesk accounting data — search contacts (customers/suppliers), query invoices, and create draft invoices from free text or structured data.",
  });

  server.tool(
    "search_contacts",
    "Search SevDesk contacts (companies/organizations) by name. Uses substring matching — legal suffixes like GmbH, AG, etc. are stripped automatically. If no results for the full name, retries with the first word. Returns all matching contacts. Use this when you need to browse multiple matches or aren't sure of the exact name.",
    {
      query: z
        .string()
        .describe(
          "Company name to search for. Substring match — e.g. 'Sportsgoods' matches 'Acme Sportsgoods GmbH'"
        ),
    },
    async ({ query }) => {
      const contacts = await searchContacts(query);
      return {
        content: [{ type: "text", text: JSON.stringify(contacts.map(formatContactForMcp)) }],
      };
    }
  );

  server.tool(
    "search_contact",
    "Search SevDesk contacts and return the single best match. Uses the same substring/fuzzy search as search_contacts but then uses AI to disambiguate and pick the best result when multiple contacts match. Use this when you need exactly one contact, e.g. to look up a specific customer.",
    {
      query: z
        .string()
        .describe(
          "Company name to search for. Substring match — e.g. 'Sportsgoods' matches 'Acme Sportsgoods GmbH'"
        ),
    },
    async ({ query }) => {
      const contact = await searchContact(query);
      if (!contact) {
        return {
          content: [{ type: "text", text: "Contact not found" }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(formatContactForMcp(contact)) }],
      };
    }
  );

  server.tool(
    "get_invoices",
    "List invoices from SevDesk with optional date range and status filters. Returns up to 100 invoices with invoice number, status, dates, amounts (net/gross), contact name, and a direct link to the invoice in SevDesk.",
    {
      startDate: z
        .string()
        .optional()
        .describe("Only invoices on or after this date (YYYY-MM-DD)"),
      endDate: z
        .string()
        .optional()
        .describe("Only invoices on or before this date (YYYY-MM-DD)"),
      status: z
        .string()
        .optional()
        .describe(
          "Filter by status: 100 = draft, 200 = open/unpaid, 1000 = paid"
        ),
    },
    async ({ startDate, endDate, status }) => {
      const invoices = await getInvoices(startDate, endDate, status);
      return {
        content: [{ type: "text", text: JSON.stringify(invoices.map(formatInvoiceForMcp)) }],
      };
    }
  );

  server.tool(
    "get_invoices_by_contact",
    "List invoices for a specific contact/company. Finds the contact by name (AI-disambiguated) then returns their invoices. Use this instead of get_invoices when you want invoices for a particular customer.",
    {
      contactQuery: z
        .string()
        .describe(
          "Company name to find invoices for. Uses the same fuzzy search as search_contact."
        ),
      startDate: z
        .string()
        .optional()
        .describe("Only invoices on or after this date (YYYY-MM-DD)"),
      endDate: z
        .string()
        .optional()
        .describe("Only invoices on or before this date (YYYY-MM-DD)"),
    },
    async ({ contactQuery, startDate, endDate }) => {
      const invoices = await getInvoicesByContact(
        contactQuery,
        startDate,
        endDate
      );
      return {
        content: [{ type: "text", text: JSON.stringify(invoices.map(formatInvoiceForMcp)) }],
      };
    }
  );

  server.tool(
    "parse_invoice_text",
    "Parse a free-text invoice description (German) into structured invoice data using AI. Returns customer, dates, financials, and line items in the exact format expected by create_invoice. This is step 1 of the text-to-invoice workflow: parse_invoice_text → (optionally create_invoice with dryRun: true to preview) → create_invoice.",
    {
      text: z
        .string()
        .describe(
          "Free-text invoice description, e.g. 'Rechnung an Mustermann GmbH, Musterstr. 1, 12345 Berlin. 5 Lizenzen Product Pro à 16€/Monat für 12 Monate ab 01.03.2026, Ansprechpartner Max Mustermann, Rechnung per E-Mail an max@mustermann.de'"
        ),
    },
    async ({ text }) => {
      const parsed = await parseInvoiceText(text);
      return {
        content: [{ type: "text", text: JSON.stringify(parsed) }],
      };
    }
  );

  server.tool(
    "create_invoice",
    "Create a draft invoice in SevDesk from structured invoice data (as returned by parse_invoice_text). The contact is resolved via fuzzy search and auto-created if not found. If an email is given, it is added to the contact and the invoice is flagged as e-Rechnung. Set dryRun: true to preview what would happen (contact resolution, line items, totals) without creating anything. On success returns the created invoice and a direct link to it in SevDesk.",
    {
      customer: z
        .object({
          companyName: z.string().describe("Company name"),
          street: z.string().default("").describe("Street and house number"),
          zipCode: z.string().default("").describe("Postal code"),
          city: z.string().default("").describe("City"),
          companyDomain: z.string().default("").describe("Company website domain, if known"),
        })
        .describe("Customer the invoice is addressed to"),
      document: z
        .object({
          quoteDate: z.string().describe("Quote date (DD.MM.YYYY)"),
          acceptanceDate: z.string().describe("Acceptance date (DD.MM.YYYY)"),
        })
        .describe("Document dates"),
      financials: z
        .object({
          vatRate: z.number().describe("VAT rate in percent: 19 for German companies, 0 for non-DE/reverse-charge"),
          totalContractValueNet: z.number().describe("Total net contract value in EUR"),
        })
        .describe("Financial summary"),
      oneTimeLineItems: z
        .array(
          z.object({
            productName: z.string(),
            flatPrice: z.number().describe("One-time net price in EUR"),
          })
        )
        .default([])
        .describe("One-time (non-recurring) line items"),
      recurringLineItems: z
        .array(
          z.object({
            productName: z.string(),
            seats: z.number().describe("Number of seats/licenses"),
            pricePerSeatPerMonth: z.number().describe("Net price per seat per month in EUR"),
            runtimeMonths: z.number().describe("Contract runtime in months"),
            startDate: z.string().describe("Start date (DD.MM.YYYY)"),
          })
        )
        .default([])
        .describe("Recurring (subscription) line items"),
      contactPerson: z
        .string()
        .optional()
        .describe("Name of the contact person at the customer, if mentioned"),
      email: z
        .string()
        .optional()
        .describe("Email address for e-Rechnung delivery, if mentioned"),
      dryRun: z
        .boolean()
        .default(false)
        .describe("If true, only preview: shows contact resolution, line items, and totals without creating the invoice"),
    },
    async ({ dryRun, ...input }) => {
      if (dryRun) {
        const preview = await dryRunInvoice(input);
        return {
          content: [{ type: "text", text: JSON.stringify(preview) }],
        };
      }

      const result = input.email || input.contactPerson
        ? await createInvoiceFromText(input)
        : await createInvoiceFromQuote(input);

      const invoice = result?.objects?.invoice;
      if (!invoice?.id) {
        // Unexpected response shape — return it raw so the agent can see what happened
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              invoice: {
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                status: STATUS_LABELS[String(invoice.status)] ?? invoice.status,
                invoiceDate: invoice.invoiceDate,
                header: invoice.header,
                addressName: invoice.addressName,
                sumNet: invoice.sumNet,
                sumGross: invoice.sumGross,
                currency: invoice.currency,
                eRechnung: !!input.email,
              },
              url: `https://my.sevdesk.de/fi/edit/type/RE/id/${invoice.id}`,
            }),
          },
        ],
      };
    }
  );

  return server;
}

export function createMcpRequestHandler() {
  return async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
}
