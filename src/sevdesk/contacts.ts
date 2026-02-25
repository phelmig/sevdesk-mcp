import { get, post } from "./client.js";
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

/** Create an organization contact in SevDesk and optionally attach an address. */
export async function createContact(customer: {
  companyName: string;
  street?: string;
  zipCode?: string;
  city?: string;
}): Promise<Contact> {
  const res = await post("/Contact", {
    name: customer.companyName,
    category: { id: 3, objectName: "Category" },
  });

  const contact: Contact = res.objects;

  // Attach address if provided
  if (customer.street || customer.zipCode || customer.city) {
    await post("/ContactAddress", {
      contact: { id: contact.id, objectName: "Contact" },
      street: customer.street ?? "",
      zip: customer.zipCode ?? "",
      city: customer.city ?? "",
      country: { id: 1, objectName: "StaticCountry" }, // Germany
    });
  }

  return contact;
}

/** Add an email (e-Rechnung / invoice address) to a contact via CommunicationWay API */
export async function addEmailToContact(contactId: string, email: string) {
  return post("/CommunicationWay", {
    contact: { id: contactId, objectName: "Contact" },
    type: "EMAIL",
    key: { id: "8", objectName: "CommunicationWayKey" }, // 8 = invoice address
    value: email,
  });
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
