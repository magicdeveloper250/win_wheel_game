import { WebSocket } from "ws";
import { subscriber, publisher } from "../config/redis";

// In-memory map: roomId → Set of local WebSocket clients
const rooms = new Map<string, Set<WebSocket>>();

export function joinRoom(roomId: string, ws: WebSocket): void {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());

    // Subscribe to Redis channel for this room
    subscriber.subscribe(`room:${roomId}`, (err) => {
      if (err) console.error(`[Redis] Subscribe error for room ${roomId}:`, err);
    });
  }
  rooms.get(roomId)!.add(ws);
}

export function leaveRoom(roomId: string, ws: WebSocket): void {
  const clients = rooms.get(roomId);
  if (!clients) return;

  clients.delete(ws);

  if (clients.size === 0) {
    rooms.delete(roomId);
    subscriber.unsubscribe(`room:${roomId}`);
  }
}

export async function broadcastToRoom(
  roomId: string,
  message: object
): Promise<void> {
  // Publish to Redis — all server instances receive this
  await publisher.publish(`room:${roomId}`, JSON.stringify(message));
}

// Redis → local WebSocket fan-out
subscriber.on("message", (channel: string, rawMessage: string) => {
  const roomId = channel.replace("room:", "");
  const clients = rooms.get(roomId);
  if (!clients) return;

  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(rawMessage);
    }
  });
});