import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  getPositionsValidator,
  getPricesValidator,
  getTradeHistoryValidator,
  getTradeQuoteValidator,
  getUserTradeHistoryValidator,
  tradeExecuteValidator,
  tradeStreamValidator,
} from "./schema.ts";
import { prisma } from "../../prisma.ts";
import { executeTrade, prices, recalculateBalance } from "../../lib/market.ts";
import { DEFAULT_LIQUIDITY_B, PAYOUT_PER_SHARE } from "../../lib/constants.ts";
import { TRADE_EVENT, tradeEvents, type TradeEvent } from "../../lib/trade-events.ts";
import type { TradeType } from "../../generated/prisma/enums.ts";

const app = new Hono();

// Returns one entry per asset that's actually on this market (seeded to 0 if
// it has no trades yet), plus the market's liquidity_b. Seeding real asset
// ids here means the LMSR helpers' hardcoded ["1","2"] fallback (in
// lib/market.ts) never gets hit for a real synced market - only the
// /simulate-trade demo route (which has no synced market backing it) relies
// on that fallback.
const fetchMarketState = async (marketId: string) => {
  const [grouped, market] = await Promise.all([
    prisma.trade.groupBy({
      where: { market_id: marketId },
      _sum: { quantity: true },
      by: ["asset_id", "type"],
    }),
    prisma.market.findUnique({
      where: { id: marketId },
      select: { liquidity_b: true, assets_options: { select: { id: true } } },
    }),
  ]);

  // Net outstanding quantity per asset - a SELL has to subtract from the
  // total, not add to it, or the aggregate the LMSR math prices off of only
  // ever grows regardless of trade direction.
  const quantityByAsset = new Map<string, number>();

  for (const row of grouped) {
    const quantity = row._sum.quantity || 0;
    const signedQuantity = row.type === "BUY" ? quantity : -quantity;
    quantityByAsset.set(
      row.asset_id,
      (quantityByAsset.get(row.asset_id) || 0) + signedQuantity,
    );
  }

  for (const asset of market?.assets_options ?? []) {
    if (!quantityByAsset.has(asset.id)) quantityByAsset.set(asset.id, 0);
  }

  return {
    trades: [...quantityByAsset.entries()].map(([asset_id, quantity]) => ({
      asset_id,
      quantity,
    })),
    liquidityB: market?.liquidity_b ?? DEFAULT_LIQUIDITY_B,
  };
};

// Net (BUY - SELL) share quantity a user holds per asset in a market.
const fetchUserPositions = async (marketId: string, userId: string) => {
  const grouped = await prisma.trade.groupBy({
    where: { market_id: marketId, user_id: userId },
    by: ["asset_id", "type"],
    _sum: { quantity: true },
  });

  const positions: Record<string, number> = {};

  for (const row of grouped) {
    const quantity = row._sum.quantity || 0;
    const signedQuantity = row.type === "BUY" ? quantity : -quantity;
    positions[row.asset_id] = (positions[row.asset_id] || 0) + signedQuantity;
  }

  return positions;
};

const fetchUserNetPosition = async (
  marketId: string,
  userId: string,
  assetId: string,
) => {
  const positions = await fetchUserPositions(marketId, userId);
  return positions[assetId] || 0;
};

// Shared by /execute (persists) and /quote (preview-only): runs the LMSR math
// and works out what the user would end up holding if this trade happened.
const computeTradeOutcome = async (
  marketId: string,
  userId: string,
  assetId: string,
  quantity: number,
  action: "buy" | "sell",
) => {
  const type = action.toUpperCase() as TradeType;
  const [{ trades, liquidityB: b }, existingPosition] = await Promise.all([
    fetchMarketState(marketId),
    fetchUserNetPosition(marketId, userId, assetId),
  ]);

  // executeTrade()'s own SELL check only guards the market-wide aggregate
  // (it can't oversell what's been bought across all users combined) - that's
  // not the same thing as this user overselling their own holdings, so check
  // that here first.
  if (type === "SELL" && quantity > existingPosition) {
    throw new Error("Cannot sell more shares than you own");
  }

  const tradeResults = executeTrade(
    { trades, balance: recalculateBalance(trades, b) },
    assetId,
    quantity,
    type,
    b,
  );

  const signedQuantity = quantity * (type === "BUY" ? 1 : -1);
  const potentialWinnings =
    (existingPosition + signedQuantity) * PAYOUT_PER_SHARE;

  return { type, tradeResults, potentialWinnings };
};

app.post("/execute", tradeExecuteValidator, async (c) => {
  const body = await c.req.valid("form");

  const { type, tradeResults, potentialWinnings } = await computeTradeOutcome(
    body.market_id,
    body.user_id,
    body.asset_id,
    body.quantity,
    body.action,
  );

  const result = await prisma.trade.create({
    data: {
      quantity: body.quantity,
      user_id: body.user_id,
      asset_id: body.asset_id,
      market_id: body.market_id, // @TODO: Get market id by asset_id
      amount: tradeResults.trade.payment,
      type,
      prices_snapshot: tradeResults.prices,
    },
  });

  const event: TradeEvent = {
    market_id: result.market_id,
    asset_id: result.asset_id,
    quantity: result.quantity,
    type,
    created_at: result.created_at,
    prices_snapshot: tradeResults.prices,
  };
  tradeEvents.emit(TRADE_EVENT, event);

  return c.json({
    user_id: result.user_id,
    asset_id: result.asset_id,
    market_id: result.market_id,
    quantity: result.quantity,
    payment: tradeResults.trade.payment,
    prices: tradeResults.prices,
    potential_winnings: potentialWinnings,
  });
});

app.get("/prices", getPricesValidator, async (c) => {
  const query = c.req.valid("query");
  const { trades, liquidityB } = await fetchMarketState(query.market_id);

  const price = prices(trades, liquidityB);

  return c.json(price);
});

// A user's current holdings in a market, and what each would pay out per the
// standard $1-per-winning-share convention (see lib/constants.ts) if that
// asset ends up resolved as the winner. Only returns assets the user
// actually holds a nonzero position in.
app.get("/positions", getPositionsValidator, async (c) => {
  const query = c.req.valid("query");
  const positions = await fetchUserPositions(query.market_id, query.user_id);

  const result = Object.entries(positions)
    .filter(([, quantity]) => quantity !== 0)
    .map(([asset_id, quantity]) => ({
      asset_id,
      quantity,
      potential_winnings: quantity * PAYOUT_PER_SHARE,
    }));

  return c.json(result);
});

// Preview-only: runs the same math as /execute but never writes to the DB.
// The frontend calls this live as the user edits quantity/amount so it can
// show an estimated price + potential winnings before they commit to a trade.
app.get("/quote", getTradeQuoteValidator, async (c) => {
  const query = c.req.valid("query");

  const { tradeResults, potentialWinnings } = await computeTradeOutcome(
    query.market_id,
    query.user_id,
    query.asset_id,
    query.quantity,
    query.action,
  );

  return c.json({
    estimated_price: tradeResults.prices[query.asset_id],
    avg_price: tradeResults.trade.avgPrice,
    potential_winnings: potentialWinnings,
    prices: tradeResults.prices,
  });
});

app.get("/history", getTradeHistoryValidator, async (c) => {
  const query = c.req.valid("query");

  const trades = await prisma.trade.findMany({
    where: { market_id: query.market_id },
    orderBy: { created_at: "asc" },
    select: {
      created_at: true,
      asset_id: true,
      quantity: true,
      type: true,
      prices_snapshot: true,
    },
  });

  return c.json(trades);
});

// A single user's own trade ledger for a market, most recent first - unlike
// /history (which is market-wide and ascending, for replaying the chart),
// this is per-user and includes `amount` (the signed LMSR payment: positive
// for a BUY's cost, negative for a SELL's refund - see lib/market.ts) so the
// frontend can show what was spent/refunded on each trade.
app.get("/user-history", getUserTradeHistoryValidator, async (c) => {
  const query = c.req.valid("query");

  const trades = await prisma.trade.findMany({
    where: { market_id: query.market_id, user_id: query.user_id },
    orderBy: { created_at: "desc" },
    select: {
      created_at: true,
      asset_id: true,
      quantity: true,
      type: true,
      amount: true,
    },
  });

  return c.json(trades);
});

// Server-Sent Events: pushes each new trade for a market to subscribed
// clients as it happens, so the frontend chart can update live instead of
// polling. One-way "server pushes price updates" is exactly what SSE is
// for - no need for full-duplex WebSockets here.
app.get("/stream", tradeStreamValidator, async (c) => {
  const { market_id } = c.req.valid("query");

  return streamSSE(c, async (stream) => {
    const onTrade = async (event: TradeEvent) => {
      if (event.market_id !== market_id) return;
      await stream.writeSSE({
        data: JSON.stringify(event),
        event: "trade",
      });
    };

    tradeEvents.on(TRADE_EVENT, onTrade);

    stream.onAbort(() => {
      tradeEvents.off(TRADE_EVENT, onTrade);
    });

    // Keep the connection open until the client disconnects.
    while (!stream.aborted) {
      await stream.sleep(15000);
      await stream.writeSSE({ data: "", event: "ping" });
    }
  });
});

app.get("/simulate-trade", async (c) => {
  const transactions = [
    {
      asset_id: "1",
      market_id: "1",
      quantity: Math.round(Math.random() * 10),
      action: "buy",
      user_id: "1",
    },
    {
      asset_id: "1",
      market_id: "1",
      quantity: 1,
      action: "sell",
      user_id: "1",
    },
  ];
  const randIdex = Math.max(
    Math.round(Math.random() * transactions.length) - 1,
    0,
  );
  const body = transactions[randIdex];

  const { trades } = await fetchMarketState(body.market_id);

  trades.push({ quantity: trades[0].quantity - (Math.round(Math.random() * trades[0].quantity * 0.10)), asset_id: "2" });

  const tradeResults = executeTrade(
    { trades, balance: recalculateBalance(trades) },
    body.asset_id,
    body.quantity,
    body.action.toUpperCase() as TradeType,
    DEFAULT_LIQUIDITY_B,
  );

  const result = await prisma.trade.create({
    data: {
      quantity: body.quantity,
      user_id: body.user_id,
      asset_id: body.asset_id,
      market_id: body.market_id, // @TODO: Get market id by asset_id
      amount: tradeResults.trade.payment,
      type: body.action.toUpperCase() as TradeType,
      prices_snapshot: tradeResults.prices,
    },
  });

  const event: TradeEvent = {
    market_id: result.market_id,
    asset_id: result.asset_id,
    quantity: result.quantity,
    type: result.type,
    created_at: result.created_at,
    prices_snapshot: tradeResults.prices,
  };
  tradeEvents.emit(TRADE_EVENT, event);

  return c.json({
    user_id: result.user_id,
    asset_id: result.asset_id,
    market_id: result.market_id,
    quantity: result.quantity,
    payment: tradeResults.trade.payment,
    prices: tradeResults.prices,
  });
});

export default app;
