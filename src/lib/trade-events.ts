import { EventEmitter } from "node:events";

export type TradeEvent = {
  market_id: string;
  asset_id: string;
  quantity: number;
  type: "BUY" | "SELL";
  created_at: Date;
  prices_snapshot: Record<string, number>;
};

// In-process pub/sub for pushing trade updates to SSE subscribers. This is
// fine for a single instance; if this service is ever horizontally scaled,
// swap it for a RabbitMQ fanout/topic exchange so every instance's
// subscribers hear every trade instead of only the ones handled by whichever
// instance executed it.
export const tradeEvents = new EventEmitter();

export const TRADE_EVENT = "trade";
