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
const REQUEST_TIMEOUT_MS = 20_000;

export const API_URL = configuredApiUrl ? configuredApiUrl.replace(/\/+$/, "") : "";

export const hasRemoteApi = Boolean(API_URL);
export const isStaticFrontend = staticFrontend;

export function missingBackendMessage() {
  return "Backend API is not configured for this GitHub Pages build. Deploy the backend and set VITE_API_URL in GitHub repository variables.";
}

function apiErrorMessage(status: number, fallback?: string) {
  if (fallback) return fallback;

  if (status === 400) return "The request was not valid. Please check your input and try again.";
  if (status === 401) return "Chat service is not authorized. Check the backend configuration.";
  if (status === 403) return "Chat service blocked this request. Check backend CORS and permissions.";
  if (status === 404) {
    return `Backend API was not found at ${API_URL}. Deploy the latest backend code or update VITE_API_URL.`;
  }
  if (status >= 500) return "Chat service is temporarily unavailable. Please try again later.";

  return "Chat service is currently unavailable. Please try again later.";
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error(missingBackendMessage());
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("Chat service took too long to respond. Please try again.");
    }
    throw new Error(
      "Chat service could not be reached. Check the backend URL and CORS configuration.",
    );
  } finally {
    window.clearTimeout(timeout);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : undefined;
    throw new Error(apiErrorMessage(response.status, message));
  }

  if (payload === null) {
    throw new Error("Chat service returned an invalid response. Please try again later.");
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
