# prediction-market-trade-service

Handles everything related to actually trading, for Prediction Market: pricing
outcomes with an LMSR market maker, executing buy/sell trades, tracking user
positions, and streaming live trade/price updates to the frontend (via Server-Sent
Events) so its charts and prices update without polling.

Keeps a local, read-only synced copy ("shadow tables") of event-service's
`Event` / `Market` / `Asset` data over RabbitMQ, so it can price and validate trades
without calling event-service on every request.

Built with [Hono](https://hono.dev/) and [Prisma](https://www.prisma.io/) (Postgres).

## Endpoints

- `POST /trade/execute` - run the LMSR math and record a trade
- `GET /trade/quote` - preview a trade's price/winnings without recording it
- `GET /trade/prices` - current implied price per asset in a market
- `GET /trade/positions` - a user's current holdings in a market
- `GET /trade/history` - market-wide trade history (feeds the price chart)
- `GET /trade/user-history` - one user's own trade ledger, most recent first
- `GET /trade/stream` - SSE stream of live trades for a market

## Running

```
npm install
npm run dev
```

Runs on `http://localhost:3002` by default (configurable via `PORT`). Requires
`DATABASE_URL`, `RABBITMQ_URL`, and `EVENT_SERVICE_URL` in `.env`.
