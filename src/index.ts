import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import trade from "./routes/trade/route.ts";
import * as RabbitMQ from "../messaging/rabbitmq.ts";

const app = new Hono();

app.use(cors());
app.route("/trade", trade);

RabbitMQ.connect();

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT) || 3002,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
