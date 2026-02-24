import { config } from "../config.js";

const BASE_URL = "https://my.sevdesk.de/api/v1";

async function request(
  method: string,
  path: string,
  params?: Record<string, string>,
  body?: unknown
): Promise<any> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `${config.SEVDESK_API_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SevDesk API ${method} ${path} failed (${res.status}): ${text}`);
  }

  return res.json();
}

export function get(path: string, params?: Record<string, string>) {
  return request("GET", path, params);
}

export function post(path: string, body: unknown) {
  return request("POST", path, undefined, body);
}
