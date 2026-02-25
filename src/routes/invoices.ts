import { Router } from "express";
import {
  createInvoiceFromQuote,
  createInvoiceFromText,
  getInvoices,
  getInvoicesByContact,
} from "../sevdesk/invoices.js";
import { parseInvoiceText } from "../llm.js";

const router = Router();

router.get("/invoices", async (req, res) => {
  try {
    const { contactQuery, startDate, endDate, status } = req.query as Record<
      string,
      string | undefined
    >;

    if (contactQuery) {
      const invoices = await getInvoicesByContact(
        contactQuery,
        startDate,
        endDate
      );
      res.json({ invoices });
    } else {
      const invoices = await getInvoices(startDate, endDate, status);
      res.json({ invoices });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/invoices/from-text", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Missing 'text' field" });
      return;
    }
    const parsed = await parseInvoiceText(text);
    res.json({ parsed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/invoices", async (req, res) => {
  try {
    const body = req.body;
    const result = body.email || body.contactPerson
      ? await createInvoiceFromText(body)
      : await createInvoiceFromQuote(body);
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
