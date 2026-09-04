import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const askStockAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        message: z.string().min(1).max(1200),
        selectedSymbol: z.string().min(1).max(20).optional(),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(5000) }))
          .max(12)
          .default([]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { runStockAgent } = await import("./ai-agent.server");
    return runStockAgent(data.message, data.history, data.selectedSymbol);
  });
