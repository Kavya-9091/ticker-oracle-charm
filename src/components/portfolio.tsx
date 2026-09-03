import { useEffect, useState } from "react";
import { Briefcase, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KEY = "stock-insight-portfolio";

type Holding = { symbol: string; quantity: number; price: number };

type Props = {
  activeSymbol: string;
  onSelect: (symbol: string) => void;
  onAskAi?: (prompt: string) => void;
};

export function Portfolio({ activeSymbol, onSelect, onAskAi }: Props) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(stored)) setHoldings(stored);
    } catch {
      setHoldings([]);
    }
  }, []);

  useEffect(() => {
    setSymbol(activeSymbol);
  }, [activeSymbol]);

  const persist = (next: Holding[]) => {
    setHoldings(next);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  };

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const sym = symbol.trim().toUpperCase();
    const qty = Number(quantity);
    const buy = Number(price);
    if (!sym || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(buy) || buy <= 0) return;
    persist([...holdings.filter((h) => h.symbol !== sym), { symbol: sym, quantity: qty, price: buy }]);
    setQuantity("");
    setPrice("");
  };

  const invested = holdings.reduce((sum, h) => sum + h.quantity * h.price, 0);

  return (
    <section className="panel-surface rounded-xl p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
        <Briefcase className="size-4" /> Portfolio
      </h2>

      <form onSubmit={add} className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol"
          aria-label="Holding symbol"
          className="tabular h-8 text-xs uppercase"
        />
        <Button type="submit" size="sm" className="h-8 gap-1 px-3 text-xs">
          <Plus className="size-3" /> Add
        </Button>
        <Input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qty"
          inputMode="decimal"
          aria-label="Quantity"
          className="tabular h-8 text-xs"
        />
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Buy price"
          inputMode="decimal"
          aria-label="Purchase price"
          className="tabular h-8 w-24 text-xs"
        />
      </form>

      {holdings.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Holdings stay on this device. Add a few, then ask the AI to analyze them.
        </p>
      ) : (
        <>
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto pr-1">
            {holdings.map((h) => (
              <li key={h.symbol} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(h.symbol)}
                  className="tabular flex-1 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                >
                  <span className="font-semibold">{h.symbol}</span>{" "}
                  <span className="text-muted-foreground">
                    {h.quantity} @ {h.price}
                  </span>
                </button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Remove ${h.symbol}`}
                  onClick={() => persist(holdings.filter((x) => x.symbol !== h.symbol))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <p className="tabular mt-2 text-xs text-muted-foreground">
            Invested: {invested.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
          {onAskAi && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3 h-8 w-full text-xs"
              onClick={() =>
                onAskAi(
                  `Analyze my portfolio for concentration risk, sector exposure and diversification.\n\n| Stock | Quantity | Purchase price |\n|---|---:|---:|\n${holdings
                    .map((h) => `| ${h.symbol} | ${h.quantity} | ${h.price} |`)
                    .join("\n")}`,
                )
              }
            >
              Analyze my portfolio with AI
            </Button>
          )}
        </>
      )}
    </section>
  );
}
