import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const snapshotInput = z.object({
  symbol: z.string().min(1).max(20),
  range: z.enum(["1d", "5d", "1mo", "1y", "5y"]).default("1mo"),
});

export const getSnapshot = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => snapshotInput.parse(data))
  .handler(async ({ data }) => {
    const { fetchSnapshot } = await import("./stocks.server");
    return fetchSnapshot(data.symbol, data.range);
  });

export const searchTickers = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ query: z.string().max(60) }).parse(data))
  .handler(async ({ data }) => {
    const { searchSymbols } = await import("./stocks.server");
    return searchSymbols(data.query);
  });
