import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownRight, ArrowUpRight, Loader2 } from "lucide-react";

import { hasRemoteApi, isStaticFrontend, missingBackendMessage, remoteApi } from "@/lib/frontend-api";
import { Button } from "@/components/ui/button";
import { INDEXES } from "@/lib/universe";

async function loadSnapshot(symbol: string) {
  if (hasRemoteApi) return remoteApi.getSnapshot({ symbol, range: "1d" });
  if (isStaticFrontend) throw new Error(missingBackendMessage());
  const { getSnapshot } = await import("@/lib/stocks.functions");
  return getSnapshot({ data: { symbol, range: "1d" } });
}

type Props = { onAskAi?: (prompt: string) => void };

export function MarketOverview({ onAskAi }: Props) {
  const indices = INDEXES.GLOBAL;

  const query = useQuery({
    queryKey: ["market-overview"],
    queryFn: async () => {
      const results = await Promise.all(
        indices.map(async (idx) => {
          try {
            const snap = await loadSnapshot(idx.symbol);
            return { label: idx.label, price: snap.price, changePercent: snap.changePercent };
          } catch {
            return { label: idx.label, price: null, changePercent: null };
          }
        }),
      );
      return results;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <section className="panel-surface rounded-xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-primary uppercase">
          <Activity className="size-4" /> Today's market
        </h2>
        {onAskAi && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            onClick={() => onAskAi("Give me today's market summary")}
          >
            Ask AI for a briefing
          </Button>
        )}
      </div>

      {query.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading index levels…
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(query.data ?? []).map((row) => {
            const up = (row.changePercent ?? 0) >= 0;
            return (
              <div key={row.label} className="rounded-lg border border-border px-3 py-2.5">
                <p className="truncate text-xs text-muted-foreground">{row.label}</p>
                <p className="tabular mt-1 text-sm font-semibold">
                  {row.price === null || row.price === undefined
                    ? "—"
                    : row.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </p>
                <p
                  className={`tabular mt-0.5 flex items-center gap-1 text-xs ${up ? "text-bull" : "text-bear"}`}
                >
                  {row.changePercent === null || row.changePercent === undefined ? (
                    "—"
                  ) : (
                    <>
                      {up ? (
                        <ArrowUpRight className="size-3" />
                      ) : (
                        <ArrowDownRight className="size-3" />
                      )}
                      {row.changePercent.toFixed(2)}%
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
