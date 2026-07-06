import * as z from "zod";
import { zValidator } from "@hono/zod-validator";

export const tradeExecuteSchema = z.object({
  quantity: z.coerce.number(),
  asset_id: z.string(),
  user_id: z.string(), // @TODO: get this from session
  market_id: z.string(),
  action: z.enum(["sell", "buy"]),
});

export const getPricesSchema = z.object({
  market_id: z.string(),
});

export const getPositionsSchema = z.object({
  user_id: z.string(), // @TODO: get this from session
  market_id: z.string(),
});

export const getTradeQuoteSchema = z.object({
  quantity: z.coerce.number(),
  asset_id: z.string(),
  user_id: z.string(), // @TODO: get this from session
  market_id: z.string(),
  action: z.enum(["sell", "buy"]),
});

export const getTradeHistorySchema = z.object({
  market_id: z.string(),
});

export const getUserTradeHistorySchema = z.object({
  market_id: z.string(),
  user_id: z.string(), // @TODO: get this from session
});

export const tradeStreamSchema = z.object({
  market_id: z.string(),
});

export const tradeExecuteValidator = zValidator("form", tradeExecuteSchema);
export const getPricesValidator = zValidator("query", getPricesSchema);
export const getPositionsValidator = zValidator("query", getPositionsSchema);
export const getTradeQuoteValidator = zValidator("query", getTradeQuoteSchema);
export const getTradeHistoryValidator = zValidator(
  "query",
  getTradeHistorySchema,
);
export const getUserTradeHistoryValidator = zValidator(
  "query",
  getUserTradeHistorySchema,
);
export const tradeStreamValidator = zValidator("query", tradeStreamSchema);
