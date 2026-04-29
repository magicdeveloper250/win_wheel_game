import { WebSocket } from "ws";
import { IncomingMessage } from "http";
import { redis } from "../config/redis";
import { joinRoom, leaveRoom, broadcastToRoom } from "./rooms";
import { generateSnowflakeIdString } from "../lib/snowFlake";
interface WsMessage {
  type: "join" | "leave" | "message" | "ping";
  roomId?: string;
  payload?: unknown;
}

export async function handleConnection(
  ws: WebSocket,
  req: IncomingMessage
): Promise<void> {
  const clientId = generateSnowflakeIdString();
  let currentRoom: string | null = null;

  console.log(`[WS] Client connected: ${clientId}`);

  // Store session in Redis (TTL: 1 hour)
  await redis.setex(`ws:session:${clientId}`, 3600, JSON.stringify({
    connectedAt: new Date().toISOString(),
    ip: req.socket.remoteAddress,
  }));

  ws.on("message", async (raw) => {
    let msg: WsMessage;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      case "join": {
        if (!msg.roomId) break;
        if (currentRoom) leaveRoom(currentRoom, ws);
        currentRoom = msg.roomId;
        joinRoom(msg.roomId, ws);
        ws.send(JSON.stringify({ type: "joined", roomId: msg.roomId }));
        break;
      }

      case "leave": {
        if (currentRoom) {
          leaveRoom(currentRoom, ws);
          currentRoom = null;
        }
        break;
      }

      case "message": {
        if (!currentRoom) {
          ws.send(JSON.stringify({ error: "Not in a room" }));
          break;
        }
        await broadcastToRoom(currentRoom, {
          type: "message",
          from: clientId,
          payload: msg.payload,
          timestamp: Date.now(),
        });
        break;
      }

      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  });

  ws.on("close", async () => {
    if (currentRoom) leaveRoom(currentRoom, ws);
    await redis.del(`ws:session:${clientId}`);
    console.log(`[WS] Client disconnected: ${clientId}`);
  });

  ws.on("error", (err) => console.error(`[WS] Error (${clientId}):`, err));
}