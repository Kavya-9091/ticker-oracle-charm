import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/payment/cancel")({
  head: () => ({
    meta: [
      { title: "Payment Cancelled · Stock Insight AI" },
      {
        name: "description",
        content: "Your payment was cancelled. No charge was made.",
      },
      {
        property: "og:title",
        content: "Payment Cancelled · Stock Insight AI",
      },
      {
        property: "og:description",
        content: "Your payment was cancelled. No charge was made.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CancelPage,
});

function CancelPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <XCircle className="size-16 text-bear" />
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
        Payment cancelled
      </h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        No charge was made. You can try again whenever you’re ready.
      </p>
      <Button asChild className="mt-8">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
