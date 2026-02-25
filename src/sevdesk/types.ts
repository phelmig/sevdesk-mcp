export interface Contact {
  id: string;
  objectName: "Contact";
  name: string;
  customerNumber?: string;
  description?: string;
  category?: { id: string; objectName: string };
}

export interface InvoicePos {
  objectName: "InvoicePos";
  mapAll: boolean;
  quantity: number;
  price: number;
  name: string;
  unity: { id: string; objectName: "Unity" };
  taxRate: number;
}

export interface Invoice {
  id: string;
  objectName: "Invoice";
  invoiceNumber: string;
  contact: { id: string; objectName: "Contact" };
  invoiceDate: string;
  status: string;
  header?: string;
  headText?: string;
  footText?: string;
  sumNet: string;
  sumGross: string;
  sumTax: string;
}

/** SevDesk invoice status codes */
export const InvoiceStatus = {
  DRAFT: "100",
  OPEN: "200",
  PAID: "1000",
} as const;

export interface ParsedInvoice extends Quote {
  contactPerson?: string;
  email?: string;
}

export interface Quote {
  customer: {
    city: string;
    street: string;
    zipCode: string;
    companyName: string;
    companyDomain: string;
  };
  document: {
    quoteDate: string;
    acceptanceDate: string;
  };
  financials: {
    vatRate: number;
    totalContractValueNet: number;
  };
  oneTimeLineItems: {
    flatPrice: number;
    productName: string;
  }[];
  recurringLineItems: {
    seats: number;
    startDate: string;
    productName: string;
    runtimeMonths: number;
    pricePerSeatPerMonth: number;
  }[];
}
