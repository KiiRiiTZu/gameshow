import { supabase } from "./supabase-client.js";

export function createRoomChannel(roomCode, handlers = {}) {
  const topic = `gameshow-room-${roomCode}`;

  const channel = supabase
    .channel(topic, {
      config: {
        broadcast: { self: true }
      }
    })
    .on("broadcast", { event: "*" }, ({ event, payload }) => {
      handlers.onEvent?.(event, payload);
    });

  return {
    channel,
    subscribe(callback) {
      channel.subscribe((status, error) => {
        handlers.onStatus?.(status, error);
        callback?.(status, error);
      });
    },
    async send(event, payload = {}) {
      return channel.send({
        type: "broadcast",
        event,
        payload
      });
    },
    async close() {
      return supabase.removeChannel(channel);
    }
  };
}
