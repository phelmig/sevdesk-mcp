import { Router } from "express";
import { searchContact } from "../sevdesk/contacts.js";

const router = Router();

router.get("/contacts/search", async (req, res) => {
  const q = req.query.q as string;
  if (!q) {
    res.status(400).json({ error: "Missing query parameter: q" });
    return;
  }

  try {
    const contact = await searchContact(q);
    if (!contact) {
      res.status(404).json({ error: "No contact found", query: q });
      return;
    }
    res.json({ contact });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
