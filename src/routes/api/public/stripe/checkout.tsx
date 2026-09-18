import { createFileRoute } from "@tanstack/react-router";

import { STRIPE_DEFAULT_PRICE_ID } from "@/config/stripe";

async function stripeFetch<T = unknown>(
  path: string,
  secretKey: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(init?.headers || {}),
    },
  });

  const data = (await response.json().catch(() => ({
    error: { message: "Stripe request failed" },
  }))) as { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(data.error?.message || "Stripe request failed");
  }

  return data as T;
}

export const Route = createFileRoute("/api/public/stripe/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secretKey = process.env["STRIPE_SECRET_KEY"];
        if (!secretKey) {
          return new Response(
            JSON.stringify({ error: "Stripe secret key is not configured." }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          );
        }

        let requestedPriceId = STRIPE_DEFAULT_PRICE_ID;
        try {
          const body = (await request.json()) as { priceId?: string | null };
          if (typeof body.priceId === "string" && body.priceId.startsWith("price_")) {
            requestedPriceId = body.priceId;
          }
        } catch {
          // Use default price if body parsing fails.
        }

        const price = await stripeFetch<{ type?: "one_time" | "recurring" }>(
          `/prices/${encodeURIComponent(requestedPriceId)}`,
          secretKey,
        );
        const mode = price.type === "recurring" ? "subscription" : "payment";

        const origin = new URL(request.url).origin;
        const params = new URLSearchParams();
        params.append("mode", mode);
        params.append(
          "success_url",
          `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        );
        params.append("cancel_url", `${origin}/payment/cancel`);
        params.append("line_items[0][price]", requestedPriceId);
        params.append("line_items[0][quantity]", "1");

        const session = await stripeFetch<{ url?: string }>(
          "/checkout/sessions",
          secretKey,
          {
            method: "POST",
            body: params.toString(),
            headers: { "content-type": "application/x-www-form-urlencoded" },
          },
        );

        if (!session.url) {
          return new Response(
            JSON.stringify({ error: "Could not create checkout session." }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          );
        }

        return new Response(JSON.stringify({ url: session.url }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
