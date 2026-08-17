import type { AgentResponse } from "./ai-agent.server";
import type { SearchHit, Snapshot } from "./stocks.server";

export type ChatRequest = {
  message: string;
  selectedSymbol?: string;
  history?: { role: "user" | "assistant"; content: string }[];
};

export type SnapshotRequest = {
  symbol: string;
  range: "1d" | "5d" | "1mo" | "1y" | "5y";
};

const configuredApiUrl = import.meta.env["VITE_API_URL"]?.trim();
const staticFrontend = import.meta.env["VITE_STATIC_FRONTEND"] === "true";

export const API_URL = configuredApiUrl ? configuredApiUrl.replace(/\/+$/, "") : "";

export const hasRemoteApi = Boolean(API_URL);
export const isStaticFrontend = staticFrontend;

export function missingBackendMessage() {
  return "Backend API is not configured for this GitHub Pages build. Deploy the backend and set VITE_API_URL in GitHub repository variables.";
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error(missingBackendMessage());
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Backend API was not found at ${API_URL}${path}. Deploy the latest backend code or update VITE_API_URL.`,
      );
    }

    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Chat service is currently unavailable. Please try again later.";
    throw new Error(message);
  }

  return payload as T;
}

export const remoteApi = {
  askStockAgent: (data: ChatRequest) =>
    apiFetch<AgentResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getSnapshot: (data: SnapshotRequest) =>
    apiFetch<Snapshot>("/api/snapshot", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  searchTickers: (query: string) =>
    apiFetch<SearchHit[]>("/api/search", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),
};
