import { WebSocket } from "ws";
import { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import { redis } from "../config/redis";
import { joinRoom, leaveRoom, broadcastToRoom } from "./rooms";
import { generateSnowflakeIdString } from "../lib/snowFlake";

interface JwtPayload {
  id: string;
  email: string;
}

interface WsMessage {
  type: "join" | "leave" | "message" | "ping";
  roomId?: string;
  payload?: unknown;
}

export async function handleConnection(
  ws: WebSocket,
  req: IncomingMessage,
): Promise<void> {
  // ── Buffer messages that arrive before we're ready ──────────────────────
  const messageQueue: Buffer[] = [];
  const earlyHandler = (raw: Buffer) => messageQueue.push(raw);
  ws.on("message", earlyHandler);

  const secret = process.env.JWT_SECRET;
  if (!secret) { ws.close(1011, "JWT secret not configured."); return; }

  const requestUrl = req.url ?? "";
  const query = requestUrl.includes("?") ? requestUrl.slice(requestUrl.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);
  const token = params.get("token");

  if (!token) { ws.close(1008, "Missing token."); return; }

  let authUser: JwtPayload;
  try {
    authUser = jwt.verify(token, secret) as JwtPayload;
  } catch {
    ws.close(1008, "Invalid or expired token.");
    return;
  }

  let currentRoom: string | null = null;
  const nodeId = process.env.WS_NODE_ID || process.env.NODE_ID || `${process.pid}`;

  console.log(`[WS] Client connected: ${authUser.id} user=${authUser.id}`);

  // Await Redis — messages are buffered during this
  await redis.setex(`ws:session:${authUser.id}`, 3600, JSON.stringify({
    connectedAt: new Date().toISOString(),
    ip: req.socket.remoteAddress,
    userId: authUser.id,
    email: authUser.email,
    nodeId,
  }));

  // ── Real message handler ────────────────────────────────────────────────
  const handleMessage = async (raw: Buffer) => {
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
        joinRoom(msg.roomId, ws, authUser.id);
        console.log(`[WS] Client ${authUser.id} joined room "${msg.roomId}"`);
        ws.send(JSON.stringify({ type: "joined", roomId: msg.roomId }));

        try {
          const snapshot = await redis.get(`game:state:${msg.roomId}`);
          if (snapshot) ws.send(snapshot);
        } catch {}
        break;
      }
      case "leave": {
        if (currentRoom) { leaveRoom(currentRoom, ws); currentRoom = null; }
        break;
      }
      case "message": {
        if (!currentRoom) { ws.send(JSON.stringify({ error: "Not in a room" })); break; }
         await broadcastToRoom(currentRoom, {
          type: "message",
          from: authUser.id,
          payload: msg.payload,
          timestamp: Date.now(),
        });
        break;
      }
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  };

  // ── Swap handlers — process any buffered messages first ─────────────────
  ws.off("message", earlyHandler);
  ws.on("message", handleMessage);

  // Drain the queue — process any messages that arrived during await
  for (const buffered of messageQueue) {
    await handleMessage(buffered);
  }

  ws.on("close", async () => {
    if (currentRoom) leaveRoom(currentRoom, ws);
    await redis.del(`ws:session:${authUser.id}`);
    console.log(`[WS] Client disconnected: ${authUser.id} user=${authUser.id}`);
  });

  ws.on("error", (err) => console.error(`[WS] Error (${authUser.id}):`, err));
}
