import type { Channel } from "amqplib";
import { upsertEventTree, type EventPayload } from "./sync.ts";
import { QUEUE_EVENT_CREATED } from "./constants.ts";

export const initHandlers = (channel: Channel) => {
  channel.consume(
    QUEUE_EVENT_CREATED,
    async (msg) => {
      if (!msg) return;

      try {
        const payload: EventPayload = JSON.parse(msg.content.toString());
        await upsertEventTree(payload);
        channel.ack(msg);
      } catch (err) {
        console.error("Failed to process event.created message:", err);
        channel.nack(msg, false, true);
      }
    },
    {
      noAck: false,
    },
  );

  console.log("RabbitMQ consumer handlers initiated");
};
