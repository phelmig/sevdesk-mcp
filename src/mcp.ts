import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { searchContacts, searchContact } from "./sevdesk/contacts.js";
import { getInvoices, getInvoicesByContact } from "./sevdesk/invoices.js";
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
      "Access SevDesk accounting data — search contacts (customers/suppliers) and query invoices.",
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
