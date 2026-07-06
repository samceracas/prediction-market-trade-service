import amqp, { type Channel, type ChannelModel } from "amqplib";
import { EVENT_EXCHANGE, QUEUE_EVENT_CREATED } from "./constants.ts";
import { initHandlers } from "./consumers.ts";
import { reconcileFullState } from "./sync.ts";

let connection: ChannelModel | null = null;
let consumeChannel: Channel | null = null;

export const connect = async () => {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL!);
    consumeChannel = await connection.createChannel();

    await consumeChannel.assertExchange(EVENT_EXCHANGE, "topic", {
      durable: true,
    });

    await consumeChannel.assertQueue(QUEUE_EVENT_CREATED, { durable: true });
    await consumeChannel.bindQueue(
      QUEUE_EVENT_CREATED,
      EVENT_EXCHANGE,
      "event.created",
    );

    connection.on("close", () => {
      console.error("RabbitMQ connection closed, reconnecting...");

      // The connection (and any channel on it) is already dead at this
      // point - don't call channel.close(), it throws because the broker
      // already tore it down. Just drop the references and reconnect.
      connection = null;
      consumeChannel = null;
      setTimeout(connect, 5000);
    });

    connection.on("error", (err) => {
      console.error("RabbitMQ connection error:", err);
    });

    initHandlers(consumeChannel);

    console.log("RabbitMQ connected");

    // Runs on both the initial boot and every reconnect (see the "close"
    // handler above), so the shadow tables self-heal after either an abrupt
    // trade-service restart or a RabbitMQ outage without needing an outbox.
    reconcileFullState();
  } catch (err) {
    // Covers both the initial connect and every retry: if the broker is
    // unreachable, don't let the rejection escape unhandled (that crashes
    // the process) - log and try again.
    console.error("Failed to connect to RabbitMQ, retrying in 5s:", err);
    setTimeout(connect, 5000);
  }
};

export const getConsumeChannel = () => {
  if (!consumeChannel) throw new Error("Consume channel not initialized");

  return consumeChannel;
};
