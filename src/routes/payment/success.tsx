import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/payment/success")({
  head: () => ({
    meta: [
      { title: "Payment Successful · Stock Insight AI" },
      {
        name: "description",
        content: "Your payment was successful. Welcome to Stock Insight AI Premium.",
      },
      {
        property: "og:title",
        content: "Payment Successful · Stock Insight AI",
      },
      {
        property: "og:description",
        content: "Your payment was successful. Welcome to Stock Insight AI Premium.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <CheckCircle className="size-16 text-bull" />
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
        Payment successful
      </h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        Thank you for subscribing. Your premium access is now active.
      </p>
      <Button asChild className="mt-8">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
