import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { Candle } from "@/lib/stocks.server";

type Props = {
  candles: Candle[];
  currency: string;
  range: "1d" | "5d" | "1mo" | "1y" | "5y";
  up: boolean;
};

const fmtNum = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "-"
    : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function StockPriceChart({ candles, currency, range, up }: Props) {
  const chartData = candles.map((c) => ({ t: c.t, c: c.c }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "var(--bull)" : "var(--bear)"} stopOpacity={0.35} />
            <stop offset="100%" stopColor={up ? "var(--bull)" : "var(--bear)"} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="t"
          tickFormatter={(t: number) =>
            range === "1d"
              ? new Date(t).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : new Date(t).toLocaleDateString([], { month: "short", day: "numeric" })
          }
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          stroke="var(--grid)"
          minTickGap={40}
        />
        <YAxis
          domain={["auto", "auto"]}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          stroke="var(--grid)"
          width={58}
          tickFormatter={(v: number) => v.toFixed(2)}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
          formatter={(v) => [`${fmtNum(Number(v))} ${currency}`, "Close"]}
        />
        <Area
          type="monotone"
          dataKey="c"
          stroke={up ? "var(--bull)" : "var(--bear)"}
          strokeWidth={2}
          fill="url(#priceFill)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
