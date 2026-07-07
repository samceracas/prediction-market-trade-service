import { prisma } from "../src/prisma.ts";

type AssetPayload = {
  id: string;
  name: string;
  display_order: number | null;
};

type MarketPayload = {
  id: string;
  name: string;
  header: string;
  status: "OPEN" | "SUSPENDED" | "RESOLVED";
  asset_type: "CHOICE";
  liquidity_b: number;
  assets_options: AssetPayload[];
};

export type EventPayload = {
  id: string;
  name: string;
  status: "OPEN" | "CLOSED";
  markets: MarketPayload[];
};

// Idempotent by id: safe to run for the same event multiple times (duplicate
// deliveries, redelivery after a nack, or a reconciliation pass re-pulling
// state that a live message already applied).
export const upsertEventTree = async (event: EventPayload) => {
  await prisma.$transaction(async (tx) => {
    await tx.event.upsert({
      where: { id: event.id },
      create: {
        id: event.id,
        name: event.name,
        status: event.status,
      },
      update: {
        name: event.name,
        status: event.status,
      },
    });

    for (const market of event.markets) {
      await tx.market.upsert({
        where: { id: market.id },
        create: {
          id: market.id,
          name: market.name,
          header: market.header,
          status: market.status,
          asset_type: market.asset_type,
          liquidity_b: market.liquidity_b,
          event_id: event.id,
        },
        update: {
          name: market.name,
          header: market.header,
          status: market.status,
          asset_type: market.asset_type,
          liquidity_b: market.liquidity_b,
          event_id: event.id,
        },
      });

      for (const asset of market.assets_options) {
        await tx.asset.upsert({
          where: { id: asset.id },
          create: {
            id: asset.id,
            name: asset.name,
            display_order: asset.display_order,
            market_id: market.id,
          },
          update: {
            name: asset.name,
            display_order: asset.display_order,
            market_id: market.id,
          },
        });
      }
    }
  });
};

// Self-heals the shadow tables after downtime: pulls the full current state
// from event-service and upserts it. Run on every RabbitMQ (re)connect so a
// trade-service restart or a RabbitMQ outage can't leave the shadow copy
// stale forever, without needing an outbox/poller on the publish side.

export const reconcileFullState = async () => {
  const eventServiceUrl = process.env.EVENT_SERVICE_URL;

  if (!eventServiceUrl) {
    console.error("EVENT_SERVICE_URL not set, skipping reconciliation");
    return;
  }

  try {
    // This needs a bit of improvement since this doesn't scale that well if the data goes beyond a certain count
    // Will probably start slowing down starting at 1k+ entries
    const res = await fetch(`${eventServiceUrl}/event/sync/full`);

    if (!res.ok) {
      throw new Error(`event-service responded with ${res.status}`);
    }

    const events: EventPayload[] = await res.json();

    for (const event of events) {
      await upsertEventTree(event);
    }

    console.log(`Reconciled ${events.length} event(s) from event-service`);
  } catch (err) {
    console.error("Full-state reconciliation failed:", err);
  }
};
