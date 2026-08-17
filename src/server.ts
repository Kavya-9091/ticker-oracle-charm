import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

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
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://kavya-9091.github.io";
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

async function handleApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  try {
    if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = (await request.json()) as {
        message?: unknown;
        selectedSymbol?: unknown;
        history?: unknown;
      };
      if (typeof body.message !== "string" || !body.message.trim()) {
        return jsonResponse(request, { error: "Message is required." }, { status: 400 });
      }
      const { runStockAgent } = await import("./lib/ai-agent.server");
      const history = Array.isArray(body.history)
        ? body.history
            .filter(
              (item) =>
                item &&
                typeof item === "object" &&
                ("role" in item ? item.role === "user" || item.role === "assistant" : false) &&
                "content" in item &&
                typeof item.content === "string",
            )
            .slice(-12)
        : [];
      const selectedSymbol =
        typeof body.selectedSymbol === "string" ? body.selectedSymbol : undefined;
      return jsonResponse(
        request,
        await runStockAgent(body.message, history, selectedSymbol),
      );
    }

    if (url.pathname === "/api/snapshot" && request.method === "POST") {
      const body = (await request.json()) as { symbol?: unknown; range?: unknown };
      if (typeof body.symbol !== "string" || !body.symbol.trim()) {
        return jsonResponse(request, { error: "Symbol is required." }, { status: 400 });
      }
      const { fetchSnapshot } = await import("./lib/stocks.server");
      return jsonResponse(
        request,
        await fetchSnapshot(body.symbol, typeof body.range === "string" ? body.range : "1mo"),
      );
    }

    if (url.pathname === "/api/search" && request.method === "POST") {
      const body = (await request.json()) as { query?: unknown };
      const { searchSymbols } = await import("./lib/stocks.server");
      return jsonResponse(
        request,
        await searchSymbols(typeof body.query === "string" ? body.query : ""),
      );
    }

    return jsonResponse(request, { error: "API route not found." }, { status: 404 });
  } catch (error) {
    console.error(error);
    return jsonResponse(
      request,
      {
        error:
          (error as Error).message ||
          "Chat service is currently unavailable. Please try again later.",
      },
      { status: 500 },
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
