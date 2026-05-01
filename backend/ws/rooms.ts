import { WebSocket } from "ws";
import { subscriber, publisher, redis } from "../config/redis";

const rooms = new Map<string, Set<WebSocket>>();
const socketUsers = new WeakMap<WebSocket, string>();
const userSockets = new Map<string, Set<WebSocket>>();

const NODE_ID = process.env.WS_NODE_ID || process.env.NODE_ID || `${process.pid}`;
const NODE_CHANNEL = `ws:node:${NODE_ID}`;

subscriber.subscribe(NODE_CHANNEL, (err) => {
  if (err) console.error(`[Redis] Subscribe error for node ${NODE_ID}:`, err);
});

export function joinRoom(roomId: string, ws: WebSocket, userId?: string): void {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
    subscriber.subscribe(`room:${roomId}`, (err) => {
      if (err) console.error(`[Redis] Subscribe error for room ${roomId}:`, err);
    });
  }

  rooms.get(roomId)!.add(ws);

  if (userId) {
    socketUsers.set(ws, userId);
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId)!.add(ws);
  }
}

export function leaveRoom(roomId: string, ws: WebSocket): void {
  const clients = rooms.get(roomId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) {
      rooms.delete(roomId);
      subscriber.unsubscribe(`room:${roomId}`);
    }
  }

  const userId = socketUsers.get(ws);
  if (!userId) return;

  const sockets = userSockets.get(userId);
  if (!sockets) return;

  sockets.delete(ws);
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }
}

// Publish to Redis so all subscribed nodes fan out to local sockets in that room.
export async function broadcastToRoom(roomId: string, data: unknown): Promise<void> {
  const msg = typeof data === "string" ? data : JSON.stringify(data);
  await publisher.publish(`room:${roomId}`, msg);
}

export async function sendToNode(nodeId: string, data: unknown): Promise<void> {
  const msg = typeof data === "string" ? data : JSON.stringify(data);
  await publisher.publish(`ws:node:${nodeId}`, msg);
}

export async function sendToUser(userId: string, roomId: string, data: unknown): Promise<void> {
  const sessionData = await redis.get(`ws:session:${userId}`);
  if (!sessionData) return;

  const session = JSON.parse(sessionData) as { userId?: string; nodeId?: string };
  if (session.userId !== userId) return;

  const directEnvelope: DirectEnvelope = {
    userId,
    roomId,
    data,
  };

  if (!session.nodeId || session.nodeId === NODE_ID) {
    deliverDirectMessageLocally(directEnvelope);
    return;
  }

  await sendToNode(session.nodeId, directEnvelope);
}

type DirectEnvelope = {
  userId: string;
  roomId: string;
  data: unknown;
};

function deliverDirectMessageLocally(message: DirectEnvelope): void {
  const clients = rooms.get(message.roomId);
  const sockets = userSockets.get(message.userId);
  if (!clients || !sockets) return;

  const payload = JSON.stringify({
    roomId: message.roomId,
    payload: message.data,
    timestamp: Date.now(),
  });

  sockets.forEach((ws) => {
    if (clients.has(ws) && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

subscriber.on("message", (channel: string, rawMessage: string) => {
  if (channel === NODE_CHANNEL) {
    try {
      const message = JSON.parse(rawMessage) as Partial<DirectEnvelope>;
      if (
        !message.userId ||
        !message.roomId
      ) {
        return;
      }

      deliverDirectMessageLocally(message as DirectEnvelope);
    } catch (error) {
      console.error(`[Subscriber] Invalid node message on "${channel}":`, error);
    }
    return;
  }

  if (!channel.startsWith("room:")) return;

  const roomId = channel.replace("room:", "");
  const clients = rooms.get(roomId);
  if (!clients) return;

  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(rawMessage);
    }
  });
});
