import { Router } from "express";
import {
  createInvoiceFromQuote,
  getInvoices,
  getInvoicesByContact,
} from "../sevdesk/invoices.js";

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

router.post("/invoices", async (req, res) => {
  try {
    const result = await createInvoiceFromQuote(req.body);
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
