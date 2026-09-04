import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const KEY = "stock-insight-watchlist";

type Props = {
  activeSymbol: string;
  onSelect: (symbol: string) => void;
  onAskAi?: (prompt: string) => void;
};

export function Watchlist({ activeSymbol, onSelect, onAskAi }: Props) {
  const [symbols, setSymbols] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(stored)) setSymbols(stored.filter((s) => typeof s === "string"));
    } catch {
      setSymbols([]);
    }
  }, []);

  const persist = (next: string[]) => {
    setSymbols(next);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  };

  const add = () => {
    const symbol = activeSymbol.trim().toUpperCase();
    if (!symbol || symbols.includes(symbol)) return;
    persist([symbol, ...symbols].slice(0, 30));
  };

  return (
    <section className="panel-surface rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
          <Star className="size-4" /> Watchlist
        </h2>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 gap-1 text-xs"
          onClick={add}
        >
          <Plus className="size-3" /> {activeSymbol}
        </Button>
      </div>

      {symbols.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Saved on this device. Add the symbol you're viewing to track it here.
        </p>
      ) : (
        <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">
          {symbols.map((symbol) => (
            <li key={symbol} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(symbol)}
                className={`tabular flex-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                  symbol === activeSymbol ? "bg-primary/15 text-primary" : ""
                }`}
              >
                {symbol}
              </button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={`Remove ${symbol}`}
                onClick={() => persist(symbols.filter((s) => s !== symbol))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {symbols.length > 0 && onAskAi && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3 h-8 w-full text-xs"
          onClick={() =>
            onAskAi(
              `Analyze my watchlist and highlight strengths and risks for each: ${symbols.join(", ")}`,
            )
          }
        >
          Ask AI about my watchlist
        </Button>
      )}
    </section>
  );
}
