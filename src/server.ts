import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

const CHAT_MESSAGE_MAX = 1200;
const HISTORY_MESSAGE_MAX = 5000;
const SEARCH_QUERY_MAX = 60;
const SYMBOL_MAX = 20;
const SYMBOL_PATTERN = /^\^?[A-Z0-9][A-Z0-9.-]{0,19}$/i;
const RANGES = new Set(["1d", "5d", "1mo", "1y", "5y"]);

const ALLOWED_ORIGINS = new Set([
  "https://kavya-9091.github.io",
  "https://ticker-oracle-charm.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
]);

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin =
    ALLOWED_ORIGINS.has(origin) || /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin)
      ? origin
      : "https://kavya-9091.github.io";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

function jsonResponse(request: Request, data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request),
      ...(init?.headers ?? {}),
    },
  });
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function serviceUnavailable(error: unknown) {
  return /market data|provider|rate-limit|timeout|temporarily unavailable|unavailable/i.test(
    String((error as Error)?.message ?? ""),
  );
}

async function handleApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  try {
    if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = await parseJsonBody(request);
      if (!isRecord(body)) {
        return jsonResponse(
          request,
          { error: "Request body must be valid JSON." },
          { status: 400 },
        );
      }
      const message = body["message"];
      const selectedSymbolInput = body["selectedSymbol"];
      const historyInput = body["history"];
      if (typeof message !== "string" || !message.trim()) {
        return jsonResponse(request, { error: "Message is required." }, { status: 400 });
      }
      if (message.length > CHAT_MESSAGE_MAX) {
        return jsonResponse(
          request,
          { error: `Message must be ${CHAT_MESSAGE_MAX} characters or fewer.` },
          { status: 400 },
        );
      }
      if (
        selectedSymbolInput !== undefined &&
        (typeof selectedSymbolInput !== "string" ||
          !selectedSymbolInput.trim() ||
          selectedSymbolInput.length > SYMBOL_MAX)
      ) {
        return jsonResponse(request, { error: "Selected symbol is invalid." }, { status: 400 });
      }
      const { runStockAgent } = await import("./lib/ai-agent.server");
      const history = Array.isArray(historyInput)
        ? historyInput
            .filter(
              (item) =>
                item &&
                typeof item === "object" &&
                ("role" in item ? item.role === "user" || item.role === "assistant" : false) &&
                "content" in item &&
                typeof item.content === "string" &&
                item.content.length <= HISTORY_MESSAGE_MAX,
            )
            .slice(-12)
        : [];
      const selectedSymbol =
        typeof selectedSymbolInput === "string" ? selectedSymbolInput : undefined;
      return jsonResponse(request, await runStockAgent(message, history, selectedSymbol));
    }

    if (url.pathname === "/api/snapshot" && request.method === "POST") {
      const body = await parseJsonBody(request);
      if (!isRecord(body)) {
        return jsonResponse(
          request,
          { error: "Request body must be valid JSON." },
          { status: 400 },
        );
      }
      const symbol = body["symbol"];
      const range = body["range"];
      if (typeof symbol !== "string" || !symbol.trim()) {
        return jsonResponse(request, { error: "Symbol is required." }, { status: 400 });
      }
      if (symbol.length > SYMBOL_MAX) {
        return jsonResponse(
          request,
          { error: `Symbol must be ${SYMBOL_MAX} characters or fewer.` },
          { status: 400 },
        );
      }
      if (!SYMBOL_PATTERN.test(symbol.trim())) {
        return jsonResponse(request, { error: "Symbol format is invalid." }, { status: 400 });
      }
      if (range !== undefined && (typeof range !== "string" || !RANGES.has(range))) {
        return jsonResponse(request, { error: "Range is invalid." }, { status: 400 });
      }
      const { fetchSnapshot } = await import("./lib/stocks.server");
      return jsonResponse(
        request,
        await fetchSnapshot(symbol, typeof range === "string" ? range : "1mo"),
      );
    }

    if (url.pathname === "/api/search" && request.method === "POST") {
      const body = await parseJsonBody(request);
      if (!isRecord(body)) {
        return jsonResponse(
          request,
          { error: "Request body must be valid JSON." },
          { status: 400 },
        );
      }
      const query = body["query"];
      if (query !== undefined && typeof query !== "string") {
        return jsonResponse(request, { error: "Search query is invalid." }, { status: 400 });
      }
      if (typeof query === "string" && query.length > SEARCH_QUERY_MAX) {
        return jsonResponse(
          request,
          { error: `Search query must be ${SEARCH_QUERY_MAX} characters or fewer.` },
          { status: 400 },
        );
      }
      const { searchSymbols } = await import("./lib/stocks.server");
      return jsonResponse(request, await searchSymbols(typeof query === "string" ? query : ""));
    }

    return jsonResponse(request, { error: "API route not found." }, { status: 404 });
  } catch (error) {
    console.error(error);
    return jsonResponse(
      request,
      {
        error: "Service is temporarily unavailable. Please try again later.",
      },
      { status: serviceUnavailable(error) ? 503 : 500 },
    );
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const apiResponse = await handleApiRequest(request);
      if (apiResponse) return apiResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
