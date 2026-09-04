// Pure technical-analysis math. No network, no framework — safe on client or server.

export type Bar = { t: number; c: number; h?: number; l?: number; v?: number };

const round = (v: number | null, d = 2) =>
  v === null || !Number.isFinite(v) ? null : Number(v.toFixed(d));

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) out.push(values[i]! * k + out[i - 1]! * (1 - k));
  return out;
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const s = emaSeries(values, period);
  return s[s.length - 1] ?? null;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function macd(values: number[]) {
  if (values.length < 35) return { macd: null, signal: null, histogram: null };
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);
  const line = values.map((_, i) => fast[i]! - slow[i]!);
  const signalSeries = emaSeries(line.slice(25), 9);
  const macdValue = line[line.length - 1]!;
  const signal = signalSeries[signalSeries.length - 1] ?? null;
  return {
    macd: round(macdValue),
    signal: round(signal),
    histogram: signal === null ? null : round(macdValue - signal),
  };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  if (mid === null) return { upper: null, middle: null, lower: null };
  const slice = values.slice(-period);
  const variance = slice.reduce((a, v) => a + (v - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { upper: round(mid + mult * sd), middle: round(mid), lower: round(mid - mult * sd) };
}

export function atr(bars: Bar[], period = 14): number | null {
  const usable = bars.filter((b) => b.h !== undefined && b.l !== undefined);
  if (usable.length <= period) {
    // Fall back to average absolute close-to-close move.
    const closes = bars.map((b) => b.c);
    if (closes.length <= period) return null;
    const moves = closes.slice(-period).map((c, i, arr) => (i ? Math.abs(c - arr[i - 1]!) : 0));
    return round(moves.reduce((a, b) => a + b, 0) / (period - 1));
  }
  const trs: number[] = [];
  for (let i = 1; i < usable.length; i++) {
    const cur = usable[i]!;
    const prev = usable[i - 1]!;
    trs.push(Math.max(cur.h! - cur.l!, Math.abs(cur.h! - prev.c), Math.abs(cur.l! - prev.c)));
  }
  return round(trs.slice(-period).reduce((a, b) => a + b, 0) / period);
}

export function annualisedVolatility(values: number[]): number | null {
  if (values.length < 20) return null;
  const rets: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    if (prev) rets.push(values[i]! / prev - 1);
  }
  if (rets.length < 10) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length);
  return round(sd * Math.sqrt(252) * 100);
}

export function supportResistance(bars: Bar[]) {
  const closes = bars.map((b) => b.c);
  if (!closes.length) return { support: null, resistance: null };
  const recent = closes.slice(-60);
  const lows = bars.slice(-60).map((b) => b.l ?? b.c);
  const highs = bars.slice(-60).map((b) => b.h ?? b.c);
  return {
    support: round(Math.min(...lows)),
    resistance: round(Math.max(...highs)),
    midpoint: round(recent.reduce((a, b) => a + b, 0) / recent.length),
  };
}

export function momentum(values: number[]) {
  const pct = (back: number) => {
    if (values.length <= back) return null;
    const then = values[values.length - 1 - back]!;
    return then ? round(((values[values.length - 1]! - then) / then) * 100) : null;
  };
  return { pct5d: pct(5), pct1mo: pct(21), pct3mo: pct(63), pct6mo: pct(126), pct1y: pct(252) };
}

export function trendLabel(price: number | null, s50: number | null, s200: number | null) {
  if (price === null) return "unknown";
  if (s50 !== null && s200 !== null) {
    if (price > s50 && s50 > s200) return "bullish";
    if (price < s50 && s50 < s200) return "bearish";
    return "mixed";
  }
  if (s50 !== null) return price > s50 ? "bullish" : "bearish";
  return "unknown";
}

export function computeIndicators(bars: Bar[]) {
  const closes = bars.map((b) => b.c).filter((c) => Number.isFinite(c));
  const price = closes[closes.length - 1] ?? null;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma100 = sma(closes, 100);
  const sma200 = sma(closes, 200);
  const volumes = bars.map((b) => b.v ?? 0).filter((v) => v > 0);
  const avgVol = volumes.length ? volumes.reduce((a, b) => a + b, 0) / volumes.length : null;
  const recentVol = volumes.length >= 5 ? sma(volumes, 5) : null;

  return {
    bars: bars.length,
    price: round(price),
    sma20: round(sma20),
    sma50: round(sma50),
    sma100: round(sma100),
    sma200: round(sma200),
    ema20: round(ema(closes, 20)),
    ema50: round(ema(closes, 50)),
    rsi14: round(rsi(closes, 14)),
    macd: macd(closes),
    bollinger: bollinger(closes),
    atr14: atr(bars),
    annualisedVolatilityPct: annualisedVolatility(closes),
    levels: supportResistance(bars),
    momentum: momentum(closes),
    trend: trendLabel(price, sma50, sma200),
    volume: {
      averageVolume: avgVol === null ? null : Math.round(avgVol),
      recent5dAverage: recentVol === null ? null : Math.round(recentVol),
      volumeTrend:
        avgVol && recentVol
          ? recentVol > avgVol * 1.15
            ? "rising"
            : recentVol < avgVol * 0.85
              ? "falling"
              : "steady"
          : null,
    },
  };
}
