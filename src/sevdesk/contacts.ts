import { get } from "./client.js";
import { pickBestContact } from "../llm.js";
import type { Contact } from "./types.js";

const LEGAL_SUFFIXES =
  /\s*(GmbH|AG|eG|e\.G\.|e\.V\.|eV|KG|OHG|UG|SE|Ltd|Inc|Corp|mbH|gGmbH|Co\.|& Co\.)\s*/gi;

function stripLegalSuffixes(name: string): string {
  return name.replace(LEGAL_SUFFIXES, " ").trim();
}

/** Return all fuzzy-matched contacts without LLM disambiguation */
export async function searchContacts(query: string): Promise<Contact[]> {
  const stripped = stripLegalSuffixes(query);

  const res = await get("/Contact", { depth: "0", name: stripped });
  let contacts: Contact[] = (res.objects ?? []).filter(
    (c: any) => c.name && c.category?.id === "3"
  );

  if (contacts.length === 0) {
    const firstWord = stripped.split(/\s+/)[0];
    if (firstWord && firstWord !== stripped) {
      const res2 = await get("/Contact", { depth: "0", name: firstWord });
      contacts = (res2.objects ?? []).filter(
        (c: any) => c.name && c.category?.id === "3"
      );
    }
  }

  return contacts;
}

export async function searchContact(query: string): Promise<Contact | null> {
  const stripped = stripLegalSuffixes(query);

  // Try full stripped name first (SevDesk `name` param does contains-search)
  const res = await get("/Contact", {
    depth: "0",
    name: stripped,
  });

  let contacts: Contact[] = (res.objects ?? []).filter(
    (c: any) => c.name && c.category?.id === "3" // category 3 = organization
  );

  // If no results, try first word
  if (contacts.length === 0) {
    const firstWord = stripped.split(/\s+/)[0];
    if (firstWord && firstWord !== stripped) {
      const res2 = await get("/Contact", {
        depth: "0",
        name: firstWord,
      });
      contacts = (res2.objects ?? []).filter(
        (c: any) => c.name && c.category?.id === "3"
      );
    }
  }

  if (contacts.length === 0) return null;
  if (contacts.length === 1) return contacts[0];

  return pickBestContact(query, contacts);
}
