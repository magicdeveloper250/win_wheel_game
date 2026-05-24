// index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";

// ws/handlers.ts
import jwt from "jsonwebtoken";

// config/redis.ts
import Redis from "ioredis";

// config/env.ts
var required = ["REDIS_URL", "DATABASE_URL", "JWT_SECRET", "PORT", "NODE_ENV"];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
var env = {
  port: Number(process.env.PORT ?? 3e3),
  nodeEnv: process.env.NODE_ENV ?? "development",
  redisUrl: process.env.REDIS_URL,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET
};

// config/redis.ts
var redisOptions = {
  retryStrategy: (times) => Math.min(times * 100, 3e3),
  maxRetriesPerRequest: 3,
  tls: {}
};
var redis = new Redis(env.redisUrl, redisOptions);
var publisher = new Redis(env.redisUrl, redisOptions);
var subscriber = new Redis(env.redisUrl, redisOptions);
redis.on("error", (err) => console.error("[Redis] Error:", err.message));
publisher.on("error", (err) => console.error("[Publisher] Error:", err.message));
subscriber.on("error", (err) => console.error("[Subscriber] Error:", err.message));
redis.on("connect", () => console.log("[Redis] Connected to Render Redis"));
publisher.on("connect", () => console.log("[Publisher] Connected"));
subscriber.on("connect", () => console.log("[Subscriber] Connected"));

// ws/rooms.ts
import { WebSocket } from "ws";
var rooms = /* @__PURE__ */ new Map();
var socketUsers = /* @__PURE__ */ new WeakMap();
var userSockets = /* @__PURE__ */ new Map();
var NODE_ID = process.env.WS_NODE_ID || process.env.NODE_ID || `${process.pid}`;
var NODE_CHANNEL = `ws:node:${NODE_ID}`;
subscriber.subscribe(NODE_CHANNEL, (err) => {
  if (err) console.error(`[Redis] Subscribe error for node ${NODE_ID}:`, err);
});
function joinRoom(roomId, ws, userId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, /* @__PURE__ */ new Set());
    subscriber.subscribe(`room:${roomId}`, (err) => {
      if (err) console.error(`[Redis] Subscribe error for room ${roomId}:`, err);
    });
  }
  rooms.get(roomId).add(ws);
  if (userId) {
    socketUsers.set(ws, userId);
    if (!userSockets.has(userId)) userSockets.set(userId, /* @__PURE__ */ new Set());
    userSockets.get(userId).add(ws);
  }
}
function leaveRoom(roomId, ws) {
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
async function broadcastToRoom(roomId, data) {
  const msg = typeof data === "string" ? data : JSON.stringify(data);
  await publisher.publish(`room:${roomId}`, msg);
}
async function sendToNode(nodeId, data) {
  const msg = typeof data === "string" ? data : JSON.stringify(data);
  await publisher.publish(`ws:node:${nodeId}`, msg);
}
async function sendToUser(userId, roomId, data) {
  const sessionData = await redis.get(`ws:session:${userId}`);
  if (!sessionData) return;
  const session = JSON.parse(sessionData);
  if (session.userId !== userId) return;
  const directEnvelope = {
    userId,
    roomId,
    data
  };
  if (!session.nodeId || session.nodeId === NODE_ID) {
    deliverDirectMessageLocally(directEnvelope);
    return;
  }
  await sendToNode(session.nodeId, directEnvelope);
}
function deliverDirectMessageLocally(message) {
  const clients = rooms.get(message.roomId);
  const sockets = userSockets.get(message.userId);
  if (!clients || !sockets) return;
  const payload = JSON.stringify({
    roomId: message.roomId,
    payload: message.data,
    timestamp: Date.now()
  });
  sockets.forEach((ws) => {
    if (clients.has(ws) && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}
subscriber.on("message", (channel, rawMessage) => {
  if (channel === NODE_CHANNEL) {
    try {
      const message = JSON.parse(rawMessage);
      if (!message.userId || !message.roomId) {
        return;
      }
      deliverDirectMessageLocally(message);
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

// ws/handlers.ts
async function handleConnection(ws, req) {
  const messageQueue = [];
  const earlyHandler = (raw2) => messageQueue.push(raw2);
  ws.on("message", earlyHandler);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    ws.close(1011, "JWT secret not configured.");
    return;
  }
  const requestUrl = req.url ?? "";
  const query = requestUrl.includes("?") ? requestUrl.slice(requestUrl.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);
  const token = params.get("token");
  if (!token) {
    ws.close(1008, "Missing token.");
    return;
  }
  let authUser;
  try {
    authUser = jwt.verify(token, secret);
  } catch {
    ws.close(1008, "Invalid or expired token.");
    return;
  }
  let currentRoom = null;
  const nodeId = process.env.WS_NODE_ID || process.env.NODE_ID || `${process.pid}`;
  console.log(`[WS] Client connected: ${authUser.id} user=${authUser.id}`);
  await redis.setex(`ws:session:${authUser.id}`, 3600, JSON.stringify({
    connectedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ip: req.socket.remoteAddress,
    userId: authUser.id,
    email: authUser.email,
    nodeId
  }));
  const handleMessage = async (raw2) => {
    let msg;
    try {
      msg = JSON.parse(raw2.toString());
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
        } catch {
        }
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
          from: authUser.id,
          payload: msg.payload,
          timestamp: Date.now()
        });
        break;
      }
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
    }
  };
  ws.off("message", earlyHandler);
  ws.on("message", handleMessage);
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

// index.ts
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

// routes/user.routes.ts
import { Router } from "express";
import jwt3 from "jsonwebtoken";

// controllers/user.controller.ts
import bcrypt from "bcryptjs";

// lib/prisma.ts
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// generated/prisma/client.ts
import * as path from "path";
import { fileURLToPath } from "url";

// generated/prisma/internal/class.ts
import * as runtime from "@prisma/client/runtime/client";
var config = {
  "previewFeatures": [],
  "clientVersion": "7.8.0",
  "engineVersion": "3c6e192761c0362d496ed980de936e2f3cebcd3a",
  "activeProvider": "mysql",
  "inlineSchema": 'generator client {\n  provider = "prisma-client"\n  output   = "../generated/prisma"\n}\n\ndatasource db {\n  provider = "mysql"\n}\n\nmodel User {\n  id                  String               @unique @default("")\n  name                String\n  email               String               @unique\n  phone               String?              @unique\n  password            String\n  role                String\n  isActive            Boolean?             @default(true)\n  createdAt           DateTime?            @default(now())\n  updatedAt           DateTime             @updatedAt\n  gameBets            GameBet[]\n  transactions        Transaction[]\n  userSessions        UserSession[]\n  passwordResetTokens PasswordResetToken[]\n  userAccounts        UserAccount[]\n\n  tickets Ticket[]\n}\n\nmodel Ticket {\n  id           String        @unique @default("")\n  userId       String\n  name         String\n  phone        String?\n  amount       Decimal\n  paid         Boolean?      @default(false)\n  won          Boolean?      @default(false)\n  createdAt    DateTime?     @default(now())\n  updatedAt    DateTime      @updatedAt\n  gameBets     GameBet[]\n  transactions Transaction[]\n  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)\n}\n\nmodel GameSession {\n  id            String            @unique @default("")\n  duration      Int\n  sessionNumber Int               @unique @default(0)\n  shouldWin     Boolean?          @default(true)\n  multiplierId  String\n  createdAt     DateTime?         @default(now())\n  updatedAt     DateTime          @updatedAt\n  status        GameSessionStatus @default(UPCOMING)\n  multiplier    GameWinMultiplier @relation(fields: [multiplierId], references: [id], onDelete: Restrict, onUpdate: Cascade)\n  betSessions   BetSession[]\n}\n\nmodel BetSession {\n  id          String            @unique @default("")\n  sessionId   String\n  session     GameSession       @relation(fields: [sessionId], references: [id], onDelete: Cascade, onUpdate: Cascade)\n  createdAt   DateTime?         @default(now())\n  updatedAt   DateTime          @updatedAt\n  status      GameSessionStatus @default(ACTIVE)\n  resultId    String?\n  result      GameResult?       @relation("BetSessionResult", fields: [resultId], references: [id], onDelete: SetNull, onUpdate: Cascade)\n  startTime   DateTime?         @default(now())\n  endTime     DateTime?\n  gameBets    GameBet[]\n  gameResults GameResult[]      @relation("GameResultSession")\n}\n\nmodel GameBet {\n  id               String     @unique @default("")\n  userId           String?\n  ticketId         String?\n  user             User?      @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)\n  ticket           Ticket?    @relation(fields: [ticketId], references: [id], onDelete: Cascade, onUpdate: Cascade)\n  targetNumber     String\n  multiplierNumber Int?       @default(0)\n  amount           Decimal\n  sessionId        String\n  session          BetSession @relation(fields: [sessionId], references: [id], onDelete: Cascade, onUpdate: Cascade)\n  createdAt        DateTime?  @default(now())\n  updatedAt        DateTime   @updatedAt\n}\n\nmodel UserAccount {\n  id        String    @unique @default("")\n  userId    String    @unique\n  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)\n  balance   Decimal\n  createdAt DateTime? @default(now())\n  updatedAt DateTime  @updatedAt\n}\n\nmodel GameResult {\n  id            String       @unique @default("")\n  sessionId     String       @unique\n  session       BetSession   @relation("GameResultSession", fields: [sessionId], references: [id], onDelete: Cascade, onUpdate: Cascade)\n  winNumber     Int\n  winMultiplier String\n  createdAt     DateTime?    @default(now())\n  updatedAt     DateTime     @updatedAt\n  betSessions   BetSession[] @relation("BetSessionResult")\n}\n\nmodel Transaction {\n  id              String    @unique @default("")\n  userId          String?\n  ticketId        String?\n  user            User?     @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)\n  ticket          Ticket?   @relation(fields: [ticketId], references: [id], onDelete: Cascade, onUpdate: Cascade)\n  amount          Decimal\n  type            String\n  tax             Decimal\n  reference_id    String?\n  exTransactionId String?\n  createdAt       DateTime? @default(now())\n  updatedAt       DateTime  @updatedAt\n}\n\nmodel AuditLog {\n  id        String    @unique @default("")\n  action    String\n  details   String\n  createdAt DateTime? @default(now())\n}\n\nmodel SystemConfig {\n  id        String    @unique @default("")\n  key       String    @unique\n  value     String\n  createdAt DateTime? @default(now())\n  updatedAt DateTime  @updatedAt\n}\n\nmodel UserSession {\n  id        String    @unique @default("")\n  userId    String\n  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)\n  token     String    @unique\n  createdAt DateTime? @default(now())\n  updatedAt DateTime  @updatedAt\n}\n\nmodel PasswordResetToken {\n  id        String    @unique @default("")\n  userId    String\n  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)\n  token     String    @unique\n  expiresAt DateTime\n  createdAt DateTime? @default(now())\n  updatedAt DateTime  @updatedAt\n}\n\nmodel GameFinancialSetting {\n  id                  String    @unique @default("")\n  maxBetAmount        Decimal\n  minBetAmount        Decimal\n  taxPercentage       Decimal\n  houseEdgePercentage Decimal\n  createdAt           DateTime? @default(now())\n  updatedAt           DateTime  @updatedAt\n}\n\nmodel GameTargetNumber {\n  id               String    @unique @default("")\n  targetNumber     Int\n  multiplierNumber Int       @default(36)\n  color            String?\n  createdAt        DateTime? @default(now())\n  updatedAt        DateTime  @updatedAt\n}\n\nmodel GameWinMultiplier {\n  id               String        @unique @default("")\n  multiplierLetter String\n  winMultiplier    Decimal       @default(6)\n  color            String?\n  createdAt        DateTime?     @default(now())\n  updatedAt        DateTime      @updatedAt\n  gameSessions     GameSession[]\n}\n\nenum GameSessionStatus {\n  UPCOMING\n  ACTIVE\n  COMPLETED\n  CANCELLED\n}\n',
  "runtimeDataModel": {
    "models": {},
    "enums": {},
    "types": {}
  },
  "parameterizationSchema": {
    "strings": [],
    "graph": ""
  }
};
config.runtimeDataModel = JSON.parse('{"models":{"User":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"email","kind":"scalar","type":"String"},{"name":"phone","kind":"scalar","type":"String"},{"name":"password","kind":"scalar","type":"String"},{"name":"role","kind":"scalar","type":"String"},{"name":"isActive","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"gameBets","kind":"object","type":"GameBet","relationName":"GameBetToUser"},{"name":"transactions","kind":"object","type":"Transaction","relationName":"TransactionToUser"},{"name":"userSessions","kind":"object","type":"UserSession","relationName":"UserToUserSession"},{"name":"passwordResetTokens","kind":"object","type":"PasswordResetToken","relationName":"PasswordResetTokenToUser"},{"name":"userAccounts","kind":"object","type":"UserAccount","relationName":"UserToUserAccount"},{"name":"tickets","kind":"object","type":"Ticket","relationName":"TicketToUser"}],"dbName":null},"Ticket":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"phone","kind":"scalar","type":"String"},{"name":"amount","kind":"scalar","type":"Decimal"},{"name":"paid","kind":"scalar","type":"Boolean"},{"name":"won","kind":"scalar","type":"Boolean"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"gameBets","kind":"object","type":"GameBet","relationName":"GameBetToTicket"},{"name":"transactions","kind":"object","type":"Transaction","relationName":"TicketToTransaction"},{"name":"user","kind":"object","type":"User","relationName":"TicketToUser"}],"dbName":null},"GameSession":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"duration","kind":"scalar","type":"Int"},{"name":"sessionNumber","kind":"scalar","type":"Int"},{"name":"shouldWin","kind":"scalar","type":"Boolean"},{"name":"multiplierId","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"status","kind":"enum","type":"GameSessionStatus"},{"name":"multiplier","kind":"object","type":"GameWinMultiplier","relationName":"GameSessionToGameWinMultiplier"},{"name":"betSessions","kind":"object","type":"BetSession","relationName":"BetSessionToGameSession"}],"dbName":null},"BetSession":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"sessionId","kind":"scalar","type":"String"},{"name":"session","kind":"object","type":"GameSession","relationName":"BetSessionToGameSession"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"status","kind":"enum","type":"GameSessionStatus"},{"name":"resultId","kind":"scalar","type":"String"},{"name":"result","kind":"object","type":"GameResult","relationName":"BetSessionResult"},{"name":"startTime","kind":"scalar","type":"DateTime"},{"name":"endTime","kind":"scalar","type":"DateTime"},{"name":"gameBets","kind":"object","type":"GameBet","relationName":"BetSessionToGameBet"},{"name":"gameResults","kind":"object","type":"GameResult","relationName":"GameResultSession"}],"dbName":null},"GameBet":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"ticketId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"GameBetToUser"},{"name":"ticket","kind":"object","type":"Ticket","relationName":"GameBetToTicket"},{"name":"targetNumber","kind":"scalar","type":"String"},{"name":"multiplierNumber","kind":"scalar","type":"Int"},{"name":"amount","kind":"scalar","type":"Decimal"},{"name":"sessionId","kind":"scalar","type":"String"},{"name":"session","kind":"object","type":"BetSession","relationName":"BetSessionToGameBet"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"UserAccount":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"UserToUserAccount"},{"name":"balance","kind":"scalar","type":"Decimal"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"GameResult":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"sessionId","kind":"scalar","type":"String"},{"name":"session","kind":"object","type":"BetSession","relationName":"GameResultSession"},{"name":"winNumber","kind":"scalar","type":"Int"},{"name":"winMultiplier","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"betSessions","kind":"object","type":"BetSession","relationName":"BetSessionResult"}],"dbName":null},"Transaction":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"ticketId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"TransactionToUser"},{"name":"ticket","kind":"object","type":"Ticket","relationName":"TicketToTransaction"},{"name":"amount","kind":"scalar","type":"Decimal"},{"name":"type","kind":"scalar","type":"String"},{"name":"tax","kind":"scalar","type":"Decimal"},{"name":"reference_id","kind":"scalar","type":"String"},{"name":"exTransactionId","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"AuditLog":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"action","kind":"scalar","type":"String"},{"name":"details","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"}],"dbName":null},"SystemConfig":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"key","kind":"scalar","type":"String"},{"name":"value","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"UserSession":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"UserToUserSession"},{"name":"token","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"PasswordResetToken":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"userId","kind":"scalar","type":"String"},{"name":"user","kind":"object","type":"User","relationName":"PasswordResetTokenToUser"},{"name":"token","kind":"scalar","type":"String"},{"name":"expiresAt","kind":"scalar","type":"DateTime"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"GameFinancialSetting":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"maxBetAmount","kind":"scalar","type":"Decimal"},{"name":"minBetAmount","kind":"scalar","type":"Decimal"},{"name":"taxPercentage","kind":"scalar","type":"Decimal"},{"name":"houseEdgePercentage","kind":"scalar","type":"Decimal"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"GameTargetNumber":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"targetNumber","kind":"scalar","type":"Int"},{"name":"multiplierNumber","kind":"scalar","type":"Int"},{"name":"color","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"}],"dbName":null},"GameWinMultiplier":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"multiplierLetter","kind":"scalar","type":"String"},{"name":"winMultiplier","kind":"scalar","type":"Decimal"},{"name":"color","kind":"scalar","type":"String"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"gameSessions","kind":"object","type":"GameSession","relationName":"GameSessionToGameWinMultiplier"}],"dbName":null}},"enums":{},"types":{}}');
config.parameterizationSchema = {
  strings: JSON.parse('["where","orderBy","cursor","user","gameBets","ticket","transactions","_count","gameSessions","multiplier","betSessions","session","result","gameResults","userSessions","passwordResetTokens","userAccounts","tickets","User.findUnique","User.findUniqueOrThrow","User.findFirst","User.findFirstOrThrow","User.findMany","data","User.createOne","User.createMany","User.updateOne","User.updateMany","create","update","User.upsertOne","User.deleteOne","User.deleteMany","having","_min","_max","User.groupBy","User.aggregate","Ticket.findUnique","Ticket.findUniqueOrThrow","Ticket.findFirst","Ticket.findFirstOrThrow","Ticket.findMany","Ticket.createOne","Ticket.createMany","Ticket.updateOne","Ticket.updateMany","Ticket.upsertOne","Ticket.deleteOne","Ticket.deleteMany","_avg","_sum","Ticket.groupBy","Ticket.aggregate","GameSession.findUnique","GameSession.findUniqueOrThrow","GameSession.findFirst","GameSession.findFirstOrThrow","GameSession.findMany","GameSession.createOne","GameSession.createMany","GameSession.updateOne","GameSession.updateMany","GameSession.upsertOne","GameSession.deleteOne","GameSession.deleteMany","GameSession.groupBy","GameSession.aggregate","BetSession.findUnique","BetSession.findUniqueOrThrow","BetSession.findFirst","BetSession.findFirstOrThrow","BetSession.findMany","BetSession.createOne","BetSession.createMany","BetSession.updateOne","BetSession.updateMany","BetSession.upsertOne","BetSession.deleteOne","BetSession.deleteMany","BetSession.groupBy","BetSession.aggregate","GameBet.findUnique","GameBet.findUniqueOrThrow","GameBet.findFirst","GameBet.findFirstOrThrow","GameBet.findMany","GameBet.createOne","GameBet.createMany","GameBet.updateOne","GameBet.updateMany","GameBet.upsertOne","GameBet.deleteOne","GameBet.deleteMany","GameBet.groupBy","GameBet.aggregate","UserAccount.findUnique","UserAccount.findUniqueOrThrow","UserAccount.findFirst","UserAccount.findFirstOrThrow","UserAccount.findMany","UserAccount.createOne","UserAccount.createMany","UserAccount.updateOne","UserAccount.updateMany","UserAccount.upsertOne","UserAccount.deleteOne","UserAccount.deleteMany","UserAccount.groupBy","UserAccount.aggregate","GameResult.findUnique","GameResult.findUniqueOrThrow","GameResult.findFirst","GameResult.findFirstOrThrow","GameResult.findMany","GameResult.createOne","GameResult.createMany","GameResult.updateOne","GameResult.updateMany","GameResult.upsertOne","GameResult.deleteOne","GameResult.deleteMany","GameResult.groupBy","GameResult.aggregate","Transaction.findUnique","Transaction.findUniqueOrThrow","Transaction.findFirst","Transaction.findFirstOrThrow","Transaction.findMany","Transaction.createOne","Transaction.createMany","Transaction.updateOne","Transaction.updateMany","Transaction.upsertOne","Transaction.deleteOne","Transaction.deleteMany","Transaction.groupBy","Transaction.aggregate","AuditLog.findUnique","AuditLog.findUniqueOrThrow","AuditLog.findFirst","AuditLog.findFirstOrThrow","AuditLog.findMany","AuditLog.createOne","AuditLog.createMany","AuditLog.updateOne","AuditLog.updateMany","AuditLog.upsertOne","AuditLog.deleteOne","AuditLog.deleteMany","AuditLog.groupBy","AuditLog.aggregate","SystemConfig.findUnique","SystemConfig.findUniqueOrThrow","SystemConfig.findFirst","SystemConfig.findFirstOrThrow","SystemConfig.findMany","SystemConfig.createOne","SystemConfig.createMany","SystemConfig.updateOne","SystemConfig.updateMany","SystemConfig.upsertOne","SystemConfig.deleteOne","SystemConfig.deleteMany","SystemConfig.groupBy","SystemConfig.aggregate","UserSession.findUnique","UserSession.findUniqueOrThrow","UserSession.findFirst","UserSession.findFirstOrThrow","UserSession.findMany","UserSession.createOne","UserSession.createMany","UserSession.updateOne","UserSession.updateMany","UserSession.upsertOne","UserSession.deleteOne","UserSession.deleteMany","UserSession.groupBy","UserSession.aggregate","PasswordResetToken.findUnique","PasswordResetToken.findUniqueOrThrow","PasswordResetToken.findFirst","PasswordResetToken.findFirstOrThrow","PasswordResetToken.findMany","PasswordResetToken.createOne","PasswordResetToken.createMany","PasswordResetToken.updateOne","PasswordResetToken.updateMany","PasswordResetToken.upsertOne","PasswordResetToken.deleteOne","PasswordResetToken.deleteMany","PasswordResetToken.groupBy","PasswordResetToken.aggregate","GameFinancialSetting.findUnique","GameFinancialSetting.findUniqueOrThrow","GameFinancialSetting.findFirst","GameFinancialSetting.findFirstOrThrow","GameFinancialSetting.findMany","GameFinancialSetting.createOne","GameFinancialSetting.createMany","GameFinancialSetting.updateOne","GameFinancialSetting.updateMany","GameFinancialSetting.upsertOne","GameFinancialSetting.deleteOne","GameFinancialSetting.deleteMany","GameFinancialSetting.groupBy","GameFinancialSetting.aggregate","GameTargetNumber.findUnique","GameTargetNumber.findUniqueOrThrow","GameTargetNumber.findFirst","GameTargetNumber.findFirstOrThrow","GameTargetNumber.findMany","GameTargetNumber.createOne","GameTargetNumber.createMany","GameTargetNumber.updateOne","GameTargetNumber.updateMany","GameTargetNumber.upsertOne","GameTargetNumber.deleteOne","GameTargetNumber.deleteMany","GameTargetNumber.groupBy","GameTargetNumber.aggregate","GameWinMultiplier.findUnique","GameWinMultiplier.findUniqueOrThrow","GameWinMultiplier.findFirst","GameWinMultiplier.findFirstOrThrow","GameWinMultiplier.findMany","GameWinMultiplier.createOne","GameWinMultiplier.createMany","GameWinMultiplier.updateOne","GameWinMultiplier.updateMany","GameWinMultiplier.upsertOne","GameWinMultiplier.deleteOne","GameWinMultiplier.deleteMany","GameWinMultiplier.groupBy","GameWinMultiplier.aggregate","AND","OR","NOT","id","multiplierLetter","winMultiplier","color","createdAt","updatedAt","equals","in","notIn","lt","lte","gt","gte","not","contains","startsWith","endsWith","search","every","some","none","targetNumber","multiplierNumber","maxBetAmount","minBetAmount","taxPercentage","houseEdgePercentage","userId","token","expiresAt","key","value","action","details","ticketId","amount","type","tax","reference_id","exTransactionId","sessionId","winNumber","balance","GameSessionStatus","status","resultId","startTime","endTime","duration","sessionNumber","shouldWin","multiplierId","name","phone","paid","won","email","password","role","isActive","is","isNot","connectOrCreate","upsert","createMany","set","disconnect","delete","connect","updateMany","deleteMany","_relevance","increment","decrement","multiply","divide"]'),
  graph: "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_ADACAAABACAPBAAA2gUAIAYAANsFACAOAADcBQAgDwAA3QUAIBAAAN4FACARAADfBQAg7wEBAAAAAfMBQAAAAAH0AUAAAAABowIBAAAAAaQCAQAAAAGnAgEAAAABqAIBAAAAAakCAQAAAAGqAiAAAAABARcAAEMAIAnvAQEAAAAB8wFAAAAAAfQBQAAAAAGjAgEAAAABpAIBAAAAAacCAQAAAAGoAgEAAAABqQIBAAAAAaoCIAAAAAEBFwAARQAwDwQAAJIFACAGAACTBQAgDgAAlAUAIA8AAJUFACAQAACWBQAgEQAAlwUAIO8BAQDTAwAh8wFAANYDACH0AUAA1wMAIaMCAQDTAwAhpAIBANUDACGnAgEA0wMAIagCAQDTAwAhqQIBANMDACGqAiAA5AMAIQIAAAABACAXAABHACAJ7wEBANMDACHzAUAA1gMAIfQBQADXAwAhowIBANMDACGkAgEA1QMAIacCAQDTAwAhqAIBANMDACGpAgEA0wMAIaoCIADkAwAhAgAAAAcAIBcAAEkAIAMAAAABACAcAABDACAdAABHACABAAAAAQAgAQAAAAcAIAYHAACPBQAgIgAAkQUAICMAAJAFACDzAQAAzQMAIKQCAADNAwAgqgIAAM0DACAM7AEAALADADDtAQAATwAQ7gEAALADADDvAQEA-gIAIfMBQAD9AgAh9AFAAP4CACGjAgEA-gIAIaQCAQD8AgAhpwIBAPoCACGoAgEA-gIAIakCAQD6AgAhqgIgAKwDACEDAAAABwAgAQAATgAwIQAATwAgAwAAAAcAIAEAAD8AMAIAAAEAIAEAAAA2ACABAAAANgAgAwAAAAkAIAEAADUAMAIAADYAIAMAAAAJACABAAA1ADACAAA2ACADAAAACQAgAQAANQAwAgAANgAgDAMAAI4FACAEAACMBQAgBgAAjQUAIO8BAQAAAAHzAUAAAAAB9AFAAAAAAYoCAQAAAAGSAhAAAAABowIBAAAAAaQCAQAAAAGlAiAAAAABpgIgAAAAAQEXAABXACAJ7wEBAAAAAfMBQAAAAAH0AUAAAAABigIBAAAAAZICEAAAAAGjAgEAAAABpAIBAAAAAaUCIAAAAAGmAiAAAAABARcAAFkAMAwDAAD2BAAgBAAA9AQAIAYAAPUEACDvAQEA0wMAIfMBQADWAwAh9AFAANcDACGKAgEA0wMAIZICEADUAwAhowIBANMDACGkAgEA1QMAIaUCIADkAwAhpgIgAOQDACECAAAANgAgFwAAWwAgCe8BAQDTAwAh8wFAANYDACH0AUAA1wMAIYoCAQDTAwAhkgIQANQDACGjAgEA0wMAIaQCAQDVAwAhpQIgAOQDACGmAiAA5AMAIQIAAAAJACAXAABdACADAAAANgAgHAAAVwAgHQAAWwAgAQAAADYAIAEAAAAJACAJBwAA7wQAICIAAPIEACAjAADxBAAgMgAA8AQAIDMAAPMEACDzAQAAzQMAIKQCAADNAwAgpQIAAM0DACCmAgAAzQMAIAzsAQAArwMAMO0BAABjABDuAQAArwMAMO8BAQD6AgAh8wFAAP0CACH0AUAA_gIAIYoCAQD6AgAhkgIQAPsCACGjAgEA-gIAIaQCAQD8AgAhpQIgAKwDACGmAiAArAMAIQMAAAAJACABAABiADAhAABjACADAAAACQAgAQAANQAwAgAANgAgAQAAABYAIAEAAAAWACADAAAAFAAgAQAAFQAwAgAAFgAgAwAAABQAIAEAABUAMAIAABYAIAMAAAAUACABAAAVADACAAAWACAKCQAA7gQAIAoAAKUEACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGbAgAAAJsCAp8CAgAAAAGgAgIAAAABoQIgAAAAAaICAQAAAAEBFwAAawAgCO8BAQAAAAHzAUAAAAAB9AFAAAAAAZsCAAAAmwICnwICAAAAAaACAgAAAAGhAiAAAAABogIBAAAAAQEXAABtADAKCQAA7QQAIAoAAOcDACDvAQEA0wMAIfMBQADWAwAh9AFAANcDACGbAgAA5QObAiKfAgIA4wMAIaACAgDjAwAhoQIgAOQDACGiAgEA0wMAIQIAAAAWACAXAABvACAI7wEBANMDACHzAUAA1gMAIfQBQADXAwAhmwIAAOUDmwIinwICAOMDACGgAgIA4wMAIaECIADkAwAhogIBANMDACECAAAAFAAgFwAAcQAgAwAAABYAIBwAAGsAIB0AAG8AIAEAAAAWACABAAAAFAAgBwcAAOgEACAiAADrBAAgIwAA6gQAIDIAAOkEACAzAADsBAAg8wEAAM0DACChAgAAzQMAIAvsAQAAqwMAMO0BAAB3ABDuAQAAqwMAMO8BAQD6AgAh8wFAAP0CACH0AUAA_gIAIZsCAACoA5sCIp8CAgCTAwAhoAICAJMDACGhAiAArAMAIaICAQD6AgAhAwAAABQAIAEAAHYAMCEAAHcAIAMAAAAUACABAAAVADACAAAWACABAAAAGwAgAQAAABsAIAMAAAAZACABAAAaADACAAAbACADAAAAGQAgAQAAGgAwAgAAGwAgAwAAABkAIAEAABoAMAIAABsAIAwEAACNBAAgCwAAjAQAIAwAAKMEACANAACOBAAg7wEBAAAAAfMBQAAAAAH0AUAAAAABlwIBAAAAAZsCAAAAmwICnAIBAAAAAZ0CQAAAAAGeAkAAAAABARcAAH8AIAjvAQEAAAAB8wFAAAAAAfQBQAAAAAGXAgEAAAABmwIAAACbAgKcAgEAAAABnQJAAAAAAZ4CQAAAAAEBFwAAgQEAMAwEAAD0AwAgCwAAigQAIAwAAPMDACANAAD1AwAg7wEBANMDACHzAUAA1gMAIfQBQADXAwAhlwIBANMDACGbAgAA5QObAiKcAgEA1QMAIZ0CQADWAwAhngJAANYDACECAAAAGwAgFwAAgwEAIAjvAQEA0wMAIfMBQADWAwAh9AFAANcDACGXAgEA0wMAIZsCAADlA5sCIpwCAQDVAwAhnQJAANYDACGeAkAA1gMAIQIAAAAZACAXAACFAQAgAwAAABsAIBwAAH8AIB0AAIMBACABAAAAGwAgAQAAABkAIAcHAADlBAAgIgAA5wQAICMAAOYEACDzAQAAzQMAIJwCAADNAwAgnQIAAM0DACCeAgAAzQMAIAvsAQAApwMAMO0BAACLAQAQ7gEAAKcDADDvAQEA-gIAIfMBQAD9AgAh9AFAAP4CACGXAgEA-gIAIZsCAACoA5sCIpwCAQD8AgAhnQJAAP0CACGeAkAA_QIAIQMAAAAZACABAACKAQAwIQAAiwEAIAMAAAAZACABAAAaADACAAAbACABAAAABQAgAQAAAAUAIAMAAAADACABAAAEADACAAAFACADAAAAAwAgAQAABAAwAgAABQAgAwAAAAMAIAEAAAQAMAIAAAUAIAwDAACUBAAgBQAAlQQAIAsAAOQEACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGEAgEAAAABhQICAAAAAYoCAQAAAAGRAgEAAAABkgIQAAAAAZcCAQAAAAEBFwAAkwEAIAnvAQEAAAAB8wFAAAAAAfQBQAAAAAGEAgEAAAABhQICAAAAAYoCAQAAAAGRAgEAAAABkgIQAAAAAZcCAQAAAAEBFwAAlQEAMAwDAACgBAAgBQAAoQQAIAsAAOMEACDvAQEA0wMAIfMBQADWAwAh9AFAANcDACGEAgEA0wMAIYUCAgCeBAAhigIBANUDACGRAgEA1QMAIZICEADUAwAhlwIBANMDACECAAAABQAgFwAAlwEAIAnvAQEA0wMAIfMBQADWAwAh9AFAANcDACGEAgEA0wMAIYUCAgCeBAAhigIBANUDACGRAgEA1QMAIZICEADUAwAhlwIBANMDACECAAAAAwAgFwAAmQEAIAMAAAAFACAcAACTAQAgHQAAlwEAIAEAAAAFACABAAAAAwAgCQcAAN4EACAiAADhBAAgIwAA4AQAIDIAAN8EACAzAADiBAAg8wEAAM0DACCFAgAAzQMAIIoCAADNAwAgkQIAAM0DACAM7AEAAKMDADDtAQAAnwEAEO4BAACjAwAw7wEBAPoCACHzAUAA_QIAIfQBQAD-AgAhhAIBAPoCACGFAgIApAMAIYoCAQD8AgAhkQIBAPwCACGSAhAA-wIAIZcCAQD6AgAhAwAAAAMAIAEAAJ4BADAhAACfAQAgAwAAAAMAIAEAAAQAMAIAAAUAIAEAAAAzACABAAAAMwAgAwAAADEAIAEAADIAMAIAADMAIAMAAAAxACABAAAyADACAAAzACADAAAAMQAgAQAAMgAwAgAAMwAgBgMAAN0EACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGKAgEAAAABmQIQAAAAAQEXAACnAQAgBe8BAQAAAAHzAUAAAAAB9AFAAAAAAYoCAQAAAAGZAhAAAAABARcAAKkBADAGAwAA3AQAIO8BAQDTAwAh8wFAANYDACH0AUAA1wMAIYoCAQDTAwAhmQIQANQDACECAAAAMwAgFwAAqwEAIAXvAQEA0wMAIfMBQADWAwAh9AFAANcDACGKAgEA0wMAIZkCEADUAwAhAgAAADEAIBcAAK0BACADAAAAMwAgHAAApwEAIB0AAKsBACABAAAAMwAgAQAAADEAIAYHAADXBAAgIgAA2gQAICMAANkEACAyAADYBAAgMwAA2wQAIPMBAADNAwAgCOwBAACiAwAw7QEAALMBABDuAQAAogMAMO8BAQD6AgAh8wFAAP0CACH0AUAA_gIAIYoCAQD6AgAhmQIQAPsCACEDAAAAMQAgAQAAsgEAMCEAALMBACADAAAAMQAgAQAAMgAwAgAAMwAgAQAAACQAIAEAAAAkACADAAAAHgAgAQAAIwAwAgAAJAAgAwAAAB4AIAEAACMAMAIAACQAIAMAAAAeACABAAAjADACAAAkACAICgAAlwQAIAsAANYEACDvAQEAAAAB8QEBAAAAAfMBQAAAAAH0AUAAAAABlwIBAAAAAZgCAgAAAAEBFwAAuwEAIAbvAQEAAAAB8QEBAAAAAfMBQAAAAAH0AUAAAAABlwIBAAAAAZgCAgAAAAEBFwAAvQEAMAgKAACBBAAgCwAA1QQAIO8BAQDTAwAh8QEBANMDACHzAUAA1gMAIfQBQADXAwAhlwIBANMDACGYAgIA4wMAIQIAAAAkACAXAAC_AQAgBu8BAQDTAwAh8QEBANMDACHzAUAA1gMAIfQBQADXAwAhlwIBANMDACGYAgIA4wMAIQIAAAAeACAXAADBAQAgAwAAACQAIBwAALsBACAdAAC_AQAgAQAAACQAIAEAAAAeACAGBwAA0AQAICIAANMEACAjAADSBAAgMgAA0QQAIDMAANQEACDzAQAAzQMAIAnsAQAAoQMAMO0BAADHAQAQ7gEAAKEDADDvAQEA-gIAIfEBAQD6AgAh8wFAAP0CACH0AUAA_gIAIZcCAQD6AgAhmAICAJMDACEDAAAAHgAgAQAAxgEAMCEAAMcBACADAAAAHgAgAQAAIwAwAgAAJAAgAQAAAA4AIAEAAAAOACADAAAADAAgAQAADQAwAgAADgAgAwAAAAwAIAEAAA0AMAIAAA4AIAMAAAAMACABAAANADACAAAOACAMAwAAzgQAIAUAAM8EACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGKAgEAAAABkQIBAAAAAZICEAAAAAGTAgEAAAABlAIQAAAAAZUCAQAAAAGWAgEAAAABARcAAM8BACAK7wEBAAAAAfMBQAAAAAH0AUAAAAABigIBAAAAAZECAQAAAAGSAhAAAAABkwIBAAAAAZQCEAAAAAGVAgEAAAABlgIBAAAAAQEXAADRAQAwDAMAAMwEACAFAADNBAAg7wEBANMDACHzAUAA1gMAIfQBQADXAwAhigIBANUDACGRAgEA1QMAIZICEADUAwAhkwIBANMDACGUAhAA1AMAIZUCAQDVAwAhlgIBANUDACECAAAADgAgFwAA0wEAIArvAQEA0wMAIfMBQADWAwAh9AFAANcDACGKAgEA1QMAIZECAQDVAwAhkgIQANQDACGTAgEA0wMAIZQCEADUAwAhlQIBANUDACGWAgEA1QMAIQIAAAAMACAXAADVAQAgAwAAAA4AIBwAAM8BACAdAADTAQAgAQAAAA4AIAEAAAAMACAKBwAAxwQAICIAAMoEACAjAADJBAAgMgAAyAQAIDMAAMsEACDzAQAAzQMAIIoCAADNAwAgkQIAAM0DACCVAgAAzQMAIJYCAADNAwAgDewBAACgAwAw7QEAANsBABDuAQAAoAMAMO8BAQD6AgAh8wFAAP0CACH0AUAA_gIAIYoCAQD8AgAhkQIBAPwCACGSAhAA-wIAIZMCAQD6AgAhlAIQAPsCACGVAgEA_AIAIZYCAQD8AgAhAwAAAAwAIAEAANoBADAhAADbAQAgAwAAAAwAIAEAAA0AMAIAAA4AIAfsAQAAnwMAMO0BAADhAQAQ7gEAAJ8DADDvAQEAAAAB8wFAAI8DACGPAgEAjAMAIZACAQCMAwAhAQAAAN4BACABAAAA3gEAIAfsAQAAnwMAMO0BAADhAQAQ7gEAAJ8DADDvAQEAjAMAIfMBQACPAwAhjwIBAIwDACGQAgEAjAMAIQLzAQAAzQMAILYCAADGBAAgAwAAAOEBACABAADiAQAwAgAA3gEAIAMAAADhAQAgAQAA4gEAMAIAAN4BACADAAAA4QEAIAEAAOIBADACAADeAQAgBO8BAQAAAAHzAUAAAAABjwIBAAAAAZACAQAAAAEBFwAA5gEAIATvAQEAAAAB8wFAAAAAAY8CAQAAAAGQAgEAAAABARcAAOgBADAE7wEBANMDACHzAUAA1gMAIY8CAQDTAwAhkAIBANMDACECAAAA3gEAIBcAAOoBACAE7wEBANMDACHzAUAA1gMAIY8CAQDTAwAhkAIBANMDACECAAAA4QEAIBcAAOwBACADAAAA3gEAIBwAAOYBACAdAADqAQAgAQAAAN4BACABAAAA4QEAIAQHAADDBAAgIgAAxQQAICMAAMQEACDzAQAAzQMAIAfsAQAAngMAMO0BAADyAQAQ7gEAAJ4DADDvAQEA-gIAIfMBQAD9AgAhjwIBAPoCACGQAgEA-gIAIQMAAADhAQAgAQAA8QEAMCEAAPIBACADAAAA4QEAIAEAAOIBADACAADeAQAgCOwBAACdAwAw7QEAAPgBABDuAQAAnQMAMO8BAQAAAAHzAUAAjwMAIfQBQACQAwAhjQIBAAAAAY4CAQCMAwAhAQAAAPUBACABAAAA9QEAIAjsAQAAnQMAMO0BAAD4AQAQ7gEAAJ0DADDvAQEAjAMAIfMBQACPAwAh9AFAAJADACGNAgEAjAMAIY4CAQCMAwAhAvMBAADNAwAgtgIAAMIEACADAAAA-AEAIAEAAPkBADACAAD1AQAgAwAAAPgBACABAAD5AQAwAgAA9QEAIAMAAAD4AQAgAQAA-QEAMAIAAPUBACAF7wEBAAAAAfMBQAAAAAH0AUAAAAABjQIBAAAAAY4CAQAAAAEBFwAA_QEAIAXvAQEAAAAB8wFAAAAAAfQBQAAAAAGNAgEAAAABjgIBAAAAAQEXAAD_AQAwBe8BAQDTAwAh8wFAANYDACH0AUAA1wMAIY0CAQDTAwAhjgIBANMDACECAAAA9QEAIBcAAIECACAF7wEBANMDACHzAUAA1gMAIfQBQADXAwAhjQIBANMDACGOAgEA0wMAIQIAAAD4AQAgFwAAgwIAIAMAAAD1AQAgHAAA_QEAIB0AAIECACABAAAA9QEAIAEAAAD4AQAgBAcAAL8EACAiAADBBAAgIwAAwAQAIPMBAADNAwAgCOwBAACcAwAw7QEAAIkCABDuAQAAnAMAMO8BAQD6AgAh8wFAAP0CACH0AUAA_gIAIY0CAQD6AgAhjgIBAPoCACEDAAAA-AEAIAEAAIgCADAhAACJAgAgAwAAAPgBACABAAD5AQAwAgAA9QEAIAEAAAArACABAAAAKwAgAwAAACkAIAEAACoAMAIAACsAIAMAAAApACABAAAqADACAAArACADAAAAKQAgAQAAKgAwAgAAKwAgBgMAAL4EACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGKAgEAAAABiwIBAAAAAQEXAACRAgAgBe8BAQAAAAHzAUAAAAAB9AFAAAAAAYoCAQAAAAGLAgEAAAABARcAAJMCADAGAwAAvQQAIO8BAQDTAwAh8wFAANYDACH0AUAA1wMAIYoCAQDTAwAhiwIBANMDACECAAAAKwAgFwAAlQIAIAXvAQEA0wMAIfMBQADWAwAh9AFAANcDACGKAgEA0wMAIYsCAQDTAwAhAgAAACkAIBcAAJcCACADAAAAKwAgHAAAkQIAIB0AAJUCACABAAAAKwAgAQAAACkAIAQHAAC6BAAgIgAAvAQAICMAALsEACDzAQAAzQMAIAjsAQAAmwMAMO0BAACdAgAQ7gEAAJsDADDvAQEA-gIAIfMBQAD9AgAh9AFAAP4CACGKAgEA-gIAIYsCAQD6AgAhAwAAACkAIAEAAJwCADAhAACdAgAgAwAAACkAIAEAACoAMAIAACsAIAEAAAAvACABAAAALwAgAwAAAC0AIAEAAC4AMAIAAC8AIAMAAAAtACABAAAuADACAAAvACADAAAALQAgAQAALgAwAgAALwAgBwMAALkEACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGKAgEAAAABiwIBAAAAAYwCQAAAAAEBFwAApQIAIAbvAQEAAAAB8wFAAAAAAfQBQAAAAAGKAgEAAAABiwIBAAAAAYwCQAAAAAEBFwAApwIAMAcDAAC4BAAg7wEBANMDACHzAUAA1gMAIfQBQADXAwAhigIBANMDACGLAgEA0wMAIYwCQADXAwAhAgAAAC8AIBcAAKkCACAG7wEBANMDACHzAUAA1gMAIfQBQADXAwAhigIBANMDACGLAgEA0wMAIYwCQADXAwAhAgAAAC0AIBcAAKsCACADAAAALwAgHAAApQIAIB0AAKkCACABAAAALwAgAQAAAC0AIAQHAAC1BAAgIgAAtwQAICMAALYEACDzAQAAzQMAIAnsAQAAmgMAMO0BAACxAgAQ7gEAAJoDADDvAQEA-gIAIfMBQAD9AgAh9AFAAP4CACGKAgEA-gIAIYsCAQD6AgAhjAJAAP4CACEDAAAALQAgAQAAsAIAMCEAALECACADAAAALQAgAQAALgAwAgAALwAgCuwBAACZAwAw7QEAALcCABDuAQAAmQMAMO8BAQAAAAHzAUAAjwMAIfQBQACQAwAhhgIQAI0DACGHAhAAjQMAIYgCEACNAwAhiQIQAI0DACEBAAAAtAIAIAEAAAC0AgAgCuwBAACZAwAw7QEAALcCABDuAQAAmQMAMO8BAQCMAwAh8wFAAI8DACH0AUAAkAMAIYYCEACNAwAhhwIQAI0DACGIAhAAjQMAIYkCEACNAwAhAvMBAADNAwAgtgIAALQEACADAAAAtwIAIAEAALgCADACAAC0AgAgAwAAALcCACABAAC4AgAwAgAAtAIAIAMAAAC3AgAgAQAAuAIAMAIAALQCACAH7wEBAAAAAfMBQAAAAAH0AUAAAAABhgIQAAAAAYcCEAAAAAGIAhAAAAABiQIQAAAAAQEXAAC8AgAgB-8BAQAAAAHzAUAAAAAB9AFAAAAAAYYCEAAAAAGHAhAAAAABiAIQAAAAAYkCEAAAAAEBFwAAvgIAMAfvAQEA0wMAIfMBQADWAwAh9AFAANcDACGGAhAA1AMAIYcCEADUAwAhiAIQANQDACGJAhAA1AMAIQIAAAC0AgAgFwAAwAIAIAfvAQEA0wMAIfMBQADWAwAh9AFAANcDACGGAhAA1AMAIYcCEADUAwAhiAIQANQDACGJAhAA1AMAIQIAAAC3AgAgFwAAwgIAIAMAAAC0AgAgHAAAvAIAIB0AAMACACABAAAAtAIAIAEAAAC3AgAgBgcAAK8EACAiAACyBAAgIwAAsQQAIDIAALAEACAzAACzBAAg8wEAAM0DACAK7AEAAJgDADDtAQAAyAIAEO4BAACYAwAw7wEBAPoCACHzAUAA_QIAIfQBQAD-AgAhhgIQAPsCACGHAhAA-wIAIYgCEAD7AgAhiQIQAPsCACEDAAAAtwIAIAEAAMcCADAhAADIAgAgAwAAALcCACABAAC4AgAwAgAAtAIAIAnsAQAAlgMAMO0BAADOAgAQ7gEAAJYDADDvAQEAAAAB8gEBAI4DACHzAUAAjwMAIfQBQACQAwAhhAICAJcDACGFAgIAlwMAIQEAAADLAgAgAQAAAMsCACAJ7AEAAJYDADDtAQAAzgIAEO4BAACWAwAw7wEBAIwDACHyAQEAjgMAIfMBQACPAwAh9AFAAJADACGEAgIAlwMAIYUCAgCXAwAhA_IBAADNAwAg8wEAAM0DACC2AgAArgQAIAMAAADOAgAgAQAAzwIAMAIAAMsCACADAAAAzgIAIAEAAM8CADACAADLAgAgAwAAAM4CACABAADPAgAwAgAAywIAIAbvAQEAAAAB8gEBAAAAAfMBQAAAAAH0AUAAAAABhAICAAAAAYUCAgAAAAEBFwAA0wIAIAbvAQEAAAAB8gEBAAAAAfMBQAAAAAH0AUAAAAABhAICAAAAAYUCAgAAAAEBFwAA1QIAMAbvAQEA0wMAIfIBAQDVAwAh8wFAANYDACH0AUAA1wMAIYQCAgDjAwAhhQICAOMDACECAAAAywIAIBcAANcCACAG7wEBANMDACHyAQEA1QMAIfMBQADWAwAh9AFAANcDACGEAgIA4wMAIYUCAgDjAwAhAgAAAM4CACAXAADZAgAgAwAAAMsCACAcAADTAgAgHQAA1wIAIAEAAADLAgAgAQAAAM4CACAHBwAAqQQAICIAAKwEACAjAACrBAAgMgAAqgQAIDMAAK0EACDyAQAAzQMAIPMBAADNAwAgCewBAACSAwAw7QEAAN8CABDuAQAAkgMAMO8BAQD6AgAh8gEBAPwCACHzAUAA_QIAIfQBQAD-AgAhhAICAJMDACGFAgIAkwMAIQMAAADOAgAgAQAA3gIAMCEAAN8CACADAAAAzgIAIAEAAM8CADACAADLAgAgCggAAJEDACDsAQAAiwMAMO0BAADlAgAQ7gEAAIsDADDvAQEAAAAB8AEBAIwDACHxARAAjQMAIfIBAQCOAwAh8wFAAI8DACH0AUAAkAMAIQEAAADiAgAgAQAAAOICACAKCAAAkQMAIOwBAACLAwAw7QEAAOUCABDuAQAAiwMAMO8BAQCMAwAh8AEBAIwDACHxARAAjQMAIfIBAQCOAwAh8wFAAI8DACH0AUAAkAMAIQQIAACnBAAg8gEAAM0DACDzAQAAzQMAILYCAACoBAAgAwAAAOUCACABAADmAgAwAgAA4gIAIAMAAADlAgAgAQAA5gIAMAIAAOICACADAAAA5QIAIAEAAOYCADACAADiAgAgBwgAAKYEACDvAQEAAAAB8AEBAAAAAfEBEAAAAAHyAQEAAAAB8wFAAAAAAfQBQAAAAAEBFwAA6gIAIAbvAQEAAAAB8AEBAAAAAfEBEAAAAAHyAQEAAAAB8wFAAAAAAfQBQAAAAAEBFwAA7AIAMAcIAADYAwAg7wEBANMDACHwAQEA0wMAIfEBEADUAwAh8gEBANUDACHzAUAA1gMAIfQBQADXAwAhAgAAAOICACAXAADuAgAgBu8BAQDTAwAh8AEBANMDACHxARAA1AMAIfIBAQDVAwAh8wFAANYDACH0AUAA1wMAIQIAAADlAgAgFwAA8AIAIAMAAADiAgAgHAAA6gIAIB0AAO4CACABAAAA4gIAIAEAAADlAgAgBwcAAM4DACAiAADRAwAgIwAA0AMAIDIAAM8DACAzAADSAwAg8gEAAM0DACDzAQAAzQMAIAnsAQAA-QIAMO0BAAD2AgAQ7gEAAPkCADDvAQEA-gIAIfABAQD6AgAh8QEQAPsCACHyAQEA_AIAIfMBQAD9AgAh9AFAAP4CACEDAAAA5QIAIAEAAPUCADAhAAD2AgAgAwAAAOUCACABAADmAgAwAgAA4gIAIAnsAQAA-QIAMO0BAAD2AgAQ7gEAAPkCADDvAQEA-gIAIfABAQD6AgAh8QEQAPsCACHyAQEA_AIAIfMBQAD9AgAh9AFAAP4CACEPBwAAgAMAICIAAIoDACAjAACKAwAg9QEBAAAAAfYBAQAAAAT3AQEAAAAE-AEBAAAAAfkBAQAAAAH6AQEAAAAB-wEBAAAAAfwBAQCJAwAh_QEBAAAAAf4BAQAAAAH_AQEAAAABgAIBAAAAAQ0HAACAAwAgIgAAiAMAICMAAIgDACAyAACIAwAgMwAAiAMAIPUBEAAAAAH2ARAAAAAE9wEQAAAABPgBEAAAAAH5ARAAAAAB-gEQAAAAAfsBEAAAAAH8ARAAhwMAIQ8HAACDAwAgIgAAhgMAICMAAIYDACD1AQEAAAAB9gEBAAAABfcBAQAAAAX4AQEAAAAB-QEBAAAAAfoBAQAAAAH7AQEAAAAB_AEBAIUDACH9AQEAAAAB_gEBAAAAAf8BAQAAAAGAAgEAAAABCwcAAIMDACAiAACEAwAgIwAAhAMAIPUBQAAAAAH2AUAAAAAF9wFAAAAABfgBQAAAAAH5AUAAAAAB-gFAAAAAAfsBQAAAAAH8AUAAggMAIQsHAACAAwAgIgAAgQMAICMAAIEDACD1AUAAAAAB9gFAAAAABPcBQAAAAAT4AUAAAAAB-QFAAAAAAfoBQAAAAAH7AUAAAAAB_AFAAP8CACELBwAAgAMAICIAAIEDACAjAACBAwAg9QFAAAAAAfYBQAAAAAT3AUAAAAAE-AFAAAAAAfkBQAAAAAH6AUAAAAAB-wFAAAAAAfwBQAD_AgAhCPUBAgAAAAH2AQIAAAAE9wECAAAABPgBAgAAAAH5AQIAAAAB-gECAAAAAfsBAgAAAAH8AQIAgAMAIQj1AUAAAAAB9gFAAAAABPcBQAAAAAT4AUAAAAAB-QFAAAAAAfoBQAAAAAH7AUAAAAAB_AFAAIEDACELBwAAgwMAICIAAIQDACAjAACEAwAg9QFAAAAAAfYBQAAAAAX3AUAAAAAF-AFAAAAAAfkBQAAAAAH6AUAAAAAB-wFAAAAAAfwBQACCAwAhCPUBAgAAAAH2AQIAAAAF9wECAAAABfgBAgAAAAH5AQIAAAAB-gECAAAAAfsBAgAAAAH8AQIAgwMAIQj1AUAAAAAB9gFAAAAABfcBQAAAAAX4AUAAAAAB-QFAAAAAAfoBQAAAAAH7AUAAAAAB_AFAAIQDACEPBwAAgwMAICIAAIYDACAjAACGAwAg9QEBAAAAAfYBAQAAAAX3AQEAAAAF-AEBAAAAAfkBAQAAAAH6AQEAAAAB-wEBAAAAAfwBAQCFAwAh_QEBAAAAAf4BAQAAAAH_AQEAAAABgAIBAAAAAQz1AQEAAAAB9gEBAAAABfcBAQAAAAX4AQEAAAAB-QEBAAAAAfoBAQAAAAH7AQEAAAAB_AEBAIYDACH9AQEAAAAB_gEBAAAAAf8BAQAAAAGAAgEAAAABDQcAAIADACAiAACIAwAgIwAAiAMAIDIAAIgDACAzAACIAwAg9QEQAAAAAfYBEAAAAAT3ARAAAAAE-AEQAAAAAfkBEAAAAAH6ARAAAAAB-wEQAAAAAfwBEACHAwAhCPUBEAAAAAH2ARAAAAAE9wEQAAAABPgBEAAAAAH5ARAAAAAB-gEQAAAAAfsBEAAAAAH8ARAAiAMAIQ8HAACAAwAgIgAAigMAICMAAIoDACD1AQEAAAAB9gEBAAAABPcBAQAAAAT4AQEAAAAB-QEBAAAAAfoBAQAAAAH7AQEAAAAB_AEBAIkDACH9AQEAAAAB_gEBAAAAAf8BAQAAAAGAAgEAAAABDPUBAQAAAAH2AQEAAAAE9wEBAAAABPgBAQAAAAH5AQEAAAAB-gEBAAAAAfsBAQAAAAH8AQEAigMAIf0BAQAAAAH-AQEAAAAB_wEBAAAAAYACAQAAAAEKCAAAkQMAIOwBAACLAwAw7QEAAOUCABDuAQAAiwMAMO8BAQCMAwAh8AEBAIwDACHxARAAjQMAIfIBAQCOAwAh8wFAAI8DACH0AUAAkAMAIQz1AQEAAAAB9gEBAAAABPcBAQAAAAT4AQEAAAAB-QEBAAAAAfoBAQAAAAH7AQEAAAAB_AEBAIoDACH9AQEAAAAB_gEBAAAAAf8BAQAAAAGAAgEAAAABCPUBEAAAAAH2ARAAAAAE9wEQAAAABPgBEAAAAAH5ARAAAAAB-gEQAAAAAfsBEAAAAAH8ARAAiAMAIQz1AQEAAAAB9gEBAAAABfcBAQAAAAX4AQEAAAAB-QEBAAAAAfoBAQAAAAH7AQEAAAAB_AEBAIYDACH9AQEAAAAB_gEBAAAAAf8BAQAAAAGAAgEAAAABCPUBQAAAAAH2AUAAAAAF9wFAAAAABfgBQAAAAAH5AUAAAAAB-gFAAAAAAfsBQAAAAAH8AUAAhAMAIQj1AUAAAAAB9gFAAAAABPcBQAAAAAT4AUAAAAAB-QFAAAAAAfoBQAAAAAH7AUAAAAAB_AFAAIEDACEDgQIAABQAIIICAAAUACCDAgAAFAAgCewBAACSAwAw7QEAAN8CABDuAQAAkgMAMO8BAQD6AgAh8gEBAPwCACHzAUAA_QIAIfQBQAD-AgAhhAICAJMDACGFAgIAkwMAIQ0HAACAAwAgIgAAgAMAICMAAIADACAyAACVAwAgMwAAgAMAIPUBAgAAAAH2AQIAAAAE9wECAAAABPgBAgAAAAH5AQIAAAAB-gECAAAAAfsBAgAAAAH8AQIAlAMAIQ0HAACAAwAgIgAAgAMAICMAAIADACAyAACVAwAgMwAAgAMAIPUBAgAAAAH2AQIAAAAE9wECAAAABPgBAgAAAAH5AQIAAAAB-gECAAAAAfsBAgAAAAH8AQIAlAMAIQj1AQgAAAAB9gEIAAAABPcBCAAAAAT4AQgAAAAB-QEIAAAAAfoBCAAAAAH7AQgAAAAB_AEIAJUDACEJ7AEAAJYDADDtAQAAzgIAEO4BAACWAwAw7wEBAIwDACHyAQEAjgMAIfMBQACPAwAh9AFAAJADACGEAgIAlwMAIYUCAgCXAwAhCPUBAgAAAAH2AQIAAAAE9wECAAAABPgBAgAAAAH5AQIAAAAB-gECAAAAAfsBAgAAAAH8AQIAgAMAIQrsAQAAmAMAMO0BAADIAgAQ7gEAAJgDADDvAQEA-gIAIfMBQAD9AgAh9AFAAP4CACGGAhAA-wIAIYcCEAD7AgAhiAIQAPsCACGJAhAA-wIAIQrsAQAAmQMAMO0BAAC3AgAQ7gEAAJkDADDvAQEAjAMAIfMBQACPAwAh9AFAAJADACGGAhAAjQMAIYcCEACNAwAhiAIQAI0DACGJAhAAjQMAIQnsAQAAmgMAMO0BAACxAgAQ7gEAAJoDADDvAQEA-gIAIfMBQAD9AgAh9AFAAP4CACGKAgEA-gIAIYsCAQD6AgAhjAJAAP4CACEI7AEAAJsDADDtAQAAnQIAEO4BAACbAwAw7wEBAPoCACHzAUAA_QIAIfQBQAD-AgAhigIBAPoCACGLAgEA-gIAIQjsAQAAnAMAMO0BAACJAgAQ7gEAAJwDADDvAQEA-gIAIfMBQAD9AgAh9AFAAP4CACGNAgEA-gIAIY4CAQD6AgAhCOwBAACdAwAw7QEAAPgBABDuAQAAnQMAMO8BAQCMAwAh8wFAAI8DACH0AUAAkAMAIY0CAQCMAwAhjgIBAIwDACEH7AEAAJ4DADDtAQAA8gEAEO4BAACeAwAw7wEBAPoCACHzAUAA_QIAIY8CAQD6AgAhkAIBAPoCACEH7AEAAJ8DADDtAQAA4QEAEO4BAACfAwAw7wEBAIwDACHzAUAAjwMAIY8CAQCMAwAhkAIBAIwDACEN7AEAAKADADDtAQAA2wEAEO4BAACgAwAw7wEBAPoCACHzAUAA_QIAIfQBQAD-AgAhigIBAPwCACGRAgEA_AIAIZICEAD7AgAhkwIBAPoCACGUAhAA-wIAIZUCAQD8AgAhlgIBAPwCACEJ7AEAAKEDADDtAQAAxwEAEO4BAAChAwAw7wEBAPoCACHxAQEA-gIAIfMBQAD9AgAh9AFAAP4CACGXAgEA-gIAIZgCAgCTAwAhCOwBAACiAwAw7QEAALMBABDuAQAAogMAMO8BAQD6AgAh8wFAAP0CACH0AUAA_gIAIYoCAQD6AgAhmQIQAPsCACEM7AEAAKMDADDtAQAAnwEAEO4BAACjAwAw7wEBAPoCACHzAUAA_QIAIfQBQAD-AgAhhAIBAPoCACGFAgIApAMAIYoCAQD8AgAhkQIBAPwCACGSAhAA-wIAIZcCAQD6AgAhDQcAAIMDACAiAACDAwAgIwAAgwMAIDIAAKYDACAzAACDAwAg9QECAAAAAfYBAgAAAAX3AQIAAAAF-AECAAAAAfkBAgAAAAH6AQIAAAAB-wECAAAAAfwBAgClAwAhDQcAAIMDACAiAACDAwAgIwAAgwMAIDIAAKYDACAzAACDAwAg9QECAAAAAfYBAgAAAAX3AQIAAAAF-AECAAAAAfkBAgAAAAH6AQIAAAAB-wECAAAAAfwBAgClAwAhCPUBCAAAAAH2AQgAAAAF9wEIAAAABfgBCAAAAAH5AQgAAAAB-gEIAAAAAfsBCAAAAAH8AQgApgMAIQvsAQAApwMAMO0BAACLAQAQ7gEAAKcDADDvAQEA-gIAIfMBQAD9AgAh9AFAAP4CACGXAgEA-gIAIZsCAACoA5sCIpwCAQD8AgAhnQJAAP0CACGeAkAA_QIAIQcHAACAAwAgIgAAqgMAICMAAKoDACD1AQAAAJsCAvYBAAAAmwII9wEAAACbAgj8AQAAqQObAiIHBwAAgAMAICIAAKoDACAjAACqAwAg9QEAAACbAgL2AQAAAJsCCPcBAAAAmwII_AEAAKkDmwIiBPUBAAAAmwIC9gEAAACbAgj3AQAAAJsCCPwBAACqA5sCIgvsAQAAqwMAMO0BAAB3ABDuAQAAqwMAMO8BAQD6AgAh8wFAAP0CACH0AUAA_gIAIZsCAACoA5sCIp8CAgCTAwAhoAICAJMDACGhAiAArAMAIaICAQD6AgAhBQcAAIMDACAiAACuAwAgIwAArgMAIPUBIAAAAAH8ASAArQMAIQUHAACDAwAgIgAArgMAICMAAK4DACD1ASAAAAAB_AEgAK0DACEC9QEgAAAAAfwBIACuAwAhDOwBAACvAwAw7QEAAGMAEO4BAACvAwAw7wEBAPoCACHzAUAA_QIAIfQBQAD-AgAhigIBAPoCACGSAhAA-wIAIaMCAQD6AgAhpAIBAPwCACGlAiAArAMAIaYCIACsAwAhDOwBAACwAwAw7QEAAE8AEO4BAACwAwAw7wEBAPoCACHzAUAA_QIAIfQBQAD-AgAhowIBAPoCACGkAgEA_AIAIacCAQD6AgAhqAIBAPoCACGpAgEA-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-QECAAAAAfoBAgAAAAH7AQIAAAAB_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-gMAMLECAAD6AwAwsgIAAPoDADCzAgAA-gMAMLQCAAD8AwAwtQIAAP0DADAGCgAAlwQAIO8BAQAAAAHxAQEAAAAB8wFAAAAAAfQBQAAAAAGYAgIAAAABAgAAACQAIBwAAJYEACADAAAAJAAgHAAAlgQAIB0AAIAEACABFwAAwAYAMAsKAAC7AwAgCwAAugMAIOwBAAC5AwAw7QEAAB4AEO4BAAC5AwAw7wEBAAAAAfEBAQCMAwAh8wFAAI8DACH0AUAAkAMAIZcCAQAAAAGYAgIAlwMAIQIAAAAkACAXAACABAAgAgAAAP4DACAXAAD_AwAgCewBAAD9AwAw7QEAAP4DABDuAQAA_QMAMO8BAQCMAwAh8QEBAIwDACHzAUAAjwMAIfQBQACQAwAhlwIBAIwDACGYAgIAlwMAIQnsAQAA_QMAMO0BAAD-AwAQ7gEAAP0DADDvAQEAjAMAIfEBAQCMAwAh8wFAAI8DACH0AUAAkAMAIZcCAQCMAwAhmAICAJcDACEF7wEBANMDACHxAQEA0wMAIfMBQADWAwAh9AFAANcDACGYAgIA4wMAIQYKAACBBAAg7wEBANMDACHxAQEA0wMAIfMBQADWAwAh9AFAANcDACGYAgIA4wMAIQscAACCBAAwHQAAhgQAMK0CAACDBAAwrgIAAIQEADCvAgAAhQQAILACAADsAwAwsQIAAOwDADCyAgAA7AMAMLMCAADsAwAwtAIAAIcEADC1AgAA7wMAMAoEAACNBAAgCwAAjAQAIA0AAI4EACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGXAgEAAAABmwIAAACbAgKdAkAAAAABngJAAAAAAQIAAAAbACAcAACLBAAgAwAAABsAIBwAAIsEACAdAACJBAAgARcAAL8GADACAAAAGwAgFwAAiQQAIAIAAADwAwAgFwAAiAQAIAfvAQEA0wMAIfMBQADWAwAh9AFAANcDACGXAgEA0wMAIZsCAADlA5sCIp0CQADWAwAhngJAANYDACEKBAAA9AMAIAsAAIoEACANAAD1AwAg7wEBANMDACHzAUAA1gMAIfQBQADXAwAhlwIBANMDACGbAgAA5QObAiKdAkAA1gMAIZ4CQADWAwAhBRwAALoGACAdAAC9BgAgrQIAALsGACCuAgAAvAYAILMCAAAWACAKBAAAjQQAIAsAAIwEACANAACOBAAg7wEBAAAAAfMBQAAAAAH0AUAAAAABlwIBAAAAAZsCAAAAmwICnQJAAAAAAZ4CQAAAAAEDHAAAugYAIK0CAAC7BgAgswIAABYAIAQcAACPBAAwrQIAAJAEADCvAgAAkQQAILMCAACSBAAwBBwAAPYDADCtAgAA9wMAMK8CAAD5AwAgswIAAPoDADAKAwAAlAQAIAUAAJUEACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGEAgEAAAABhQICAAAAAYoCAQAAAAGRAgEAAAABkgIQAAAAAQIAAAAFACAcAACTBAAgARcAALkGADAPAwAAxAMAIAUAAMUDACALAAC6AwAg7AEAAMsDADDtAQAAAwAQ7gEAAMsDADDvAQEAAAAB8wFAAI8DACH0AUAAkAMAIYQCAQCMAwAhhQICAMwDACGKAgEAjgMAIZECAQCOAwAhkgIQAI0DACGXAgEAjAMAIQoDAACUBAAgBQAAlQQAIO8BAQAAAAHzAUAAAAAB9AFAAAAAAYQCAQAAAAGFAgIAAAABigIBAAAAAZECAQAAAAGSAhAAAAABAxwAALQGACCtAgAAtQYAILMCAAABACADHAAArwYAIK0CAACwBgAgswIAADYAIAYKAACXBAAg7wEBAAAAAfEBAQAAAAHzAUAAAAAB9AFAAAAAAZgCAgAAAAEEHAAAggQAMK0CAACDBAAwrwIAAIUEACCzAgAA7AMAMAMAAAAFACAcAACTBAAgHQAAnwQAIAIAAAAFACAXAACfBAAgAgAAAJwEACAXAACdBAAgDOwBAACbBAAw7QEAAJwEABDuAQAAmwQAMO8BAQCMAwAh8wFAAI8DACH0AUAAkAMAIYQCAQCMAwAhhQICAMwDACGKAgEAjgMAIZECAQCOAwAhkgIQAI0DACGXAgEAjAMAIQzsAQAAmwQAMO0BAACcBAAQ7gEAAJsEADDvAQEAjAMAIfMBQACPAwAh9AFAAJADACGEAgEAjAMAIYUCAgDMAwAhigIBAI4DACGRAgEAjgMAIZICEACNAwAhlwIBAIwDACEI7wEBANMDACHzAUAA1gMAIfQBQADXAwAhhAIBANMDACGFAgIAngQAIYoCAQDVAwAhkQIBANUDACGSAhAA1AMAIQWwAgIAAAABtwICAAAAAbgCAgAAAAG5AgIAAAABugICAAAAAQoDAACgBAAgBQAAoQQAIO8BAQDTAwAh8wFAANYDACH0AUAA1wMAIYQCAQDTAwAhhQICAJ4EACGKAgEA1QMAIZECAQDVAwAhkgIQANQDACEHHAAAtAYAIB0AALcGACCtAgAAtQYAIK4CAAC2BgAgsQIAAAcAILICAAAHACCzAgAAAQAgBxwAAK8GACAdAACyBgAgrQIAALAGACCuAgAAsQYAILECAAAJACCyAgAACQAgswIAADYAIAoEAACNBAAgDAAAowQAIA0AAI4EACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGbAgAAAJsCApwCAQAAAAGdAkAAAAABngJAAAAAAQMcAACtBgAgrQIAAK4GACCzAgAAJAAgCAoAAKUEACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGbAgAAAJsCAp8CAgAAAAGgAgIAAAABoQIgAAAAAQQcAADoAwAwrQIAAOkDADCvAgAA6wMAILMCAADsAwAwBBwAANkDADCtAgAA2gMAMK8CAADcAwAgswIAAN0DADAAAYACAQAAAAEAAAAAAAGAAgEAAAABAAAAAAABgAIBAAAAAQAAAAUcAACoBgAgHQAAqwYAIK0CAACpBgAgrgIAAKoGACCzAgAAAQAgAxwAAKgGACCtAgAAqQYAILMCAAABACAAAAAFHAAAowYAIB0AAKYGACCtAgAApAYAIK4CAAClBgAgswIAAAEAIAMcAACjBgAgrQIAAKQGACCzAgAAAQAgAAAAAYACAQAAAAEAAAABgAIBAAAAAQAAAAAABxwAAJsGACAdAAChBgAgrQIAAJwGACCuAgAAoAYAILECAAAHACCyAgAABwAgswIAAAEAIAccAACZBgAgHQAAngYAIK0CAACaBgAgrgIAAJ0GACCxAgAACQAgsgIAAAkAILMCAAA2ACADHAAAmwYAIK0CAACcBgAgswIAAAEAIAMcAACZBgAgrQIAAJoGACCzAgAANgAgAAAAAAAFHAAAlAYAIB0AAJcGACCtAgAAlQYAIK4CAACWBgAgswIAABsAIAMcAACUBgAgrQIAAJUGACCzAgAAGwAgAAAAAAAFHAAAjwYAIB0AAJIGACCtAgAAkAYAIK4CAACRBgAgswIAAAEAIAMcAACPBgAgrQIAAJAGACCzAgAAAQAgAAAAAAAFHAAAigYAIB0AAI0GACCtAgAAiwYAIK4CAACMBgAgswIAABsAIAMcAACKBgAgrQIAAIsGACCzAgAAGwAgAAAAAAAAAAAFHAAAhQYAIB0AAIgGACCtAgAAhgYAIK4CAACHBgAgswIAAOICACADHAAAhQYAIK0CAACGBgAgswIAAOICACAAAAAAAAscAACDBQAwHQAAhwUAMK0CAACEBQAwrgIAAIUFADCvAgAAhgUAILACAACSBAAwsQIAAJIEADCyAgAAkgQAMLMCAACSBAAwtAIAAIgFADC1AgAAmwQAMAscAAD3BAAwHQAA_AQAMK0CAAD4BAAwrgIAAPkEADCvAgAA-gQAILACAAD7BAAwsQIAAPsEADCyAgAA-wQAMLMCAAD7BAAwtAIAAP0EADC1AgAA_gQAMAUcAAD-BQAgHQAAgwYAIK0CAAD_BQAgrgIAAIIGACCzAgAAAQAgCgMAAM4EACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGKAgEAAAABkgIQAAAAAZMCAQAAAAGUAhAAAAABlQIBAAAAAZYCAQAAAAECAAAADgAgHAAAggUAIAMAAAAOACAcAACCBQAgHQAAgQUAIAEXAACBBgAwDwMAAMQDACAFAADFAwAg7AEAAMMDADDtAQAADAAQ7gEAAMMDADDvAQEAAAAB8wFAAI8DACH0AUAAkAMAIYoCAQCOAwAhkQIBAI4DACGSAhAAjQMAIZMCAQCMAwAhlAIQAI0DACGVAgEAjgMAIZYCAQCOAwAhAgAAAA4AIBcAAIEFACACAAAA_wQAIBcAAIAFACAN7AEAAP4EADDtAQAA_wQAEO4BAAD-BAAw7wEBAIwDACHzAUAAjwMAIfQBQACQAwAhigIBAI4DACGRAgEAjgMAIZICEACNAwAhkwIBAIwDACGUAhAAjQMAIZUCAQCOAwAhlgIBAI4DACEN7AEAAP4EADDtAQAA_wQAEO4BAAD-BAAw7wEBAIwDACHzAUAAjwMAIfQBQACQAwAhigIBAI4DACGRAgEAjgMAIZICEACNAwAhkwIBAIwDACGUAhAAjQMAIZUCAQCOAwAhlgIBAI4DACEJ7wEBANMDACHzAUAA1gMAIfQBQADXAwAhigIBANUDACGSAhAA1AMAIZMCAQDTAwAhlAIQANQDACGVAgEA1QMAIZYCAQDVAwAhCgMAAMwEACDvAQEA0wMAIfMBQADWAwAh9AFAANcDACGKAgEA1QMAIZICEADUAwAhkwIBANMDACGUAhAA1AMAIZUCAQDVAwAhlgIBANUDACEKAwAAzgQAIO8BAQAAAAHzAUAAAAAB9AFAAAAAAYoCAQAAAAGSAhAAAAABkwIBAAAAAZQCEAAAAAGVAgEAAAABlgIBAAAAAQoDAACUBAAgCwAA5AQAIO8BAQAAAAHzAUAAAAAB9AFAAAAAAYQCAQAAAAGFAgIAAAABigIBAAAAAZICEAAAAAGXAgEAAAABAgAAAAUAIBwAAIsFACADAAAABQAgHAAAiwUAIB0AAIoFACABFwAAgAYAMAIAAAAFACAXAACKBQAgAgAAAJwEACAXAACJBQAgCO8BAQDTAwAh8wFAANYDACH0AUAA1wMAIYQCAQDTAwAhhQICAJ4EACGKAgEA1QMAIZICEADUAwAhlwIBANMDACEKAwAAoAQAIAsAAOMEACDvAQEA0wMAIfMBQADWAwAh9AFAANcDACGEAgEA0wMAIYUCAgCeBAAhigIBANUDACGSAhAA1AMAIZcCAQDTAwAhCgMAAJQEACALAADkBAAg7wEBAAAAAfMBQAAAAAH0AUAAAAABhAIBAAAAAYUCAgAAAAGKAgEAAAABkgIQAAAAAZcCAQAAAAEEHAAAgwUAMK0CAACEBQAwrwIAAIYFACCzAgAAkgQAMAQcAAD3BAAwrQIAAPgEADCvAgAA-gQAILMCAAD7BAAwAxwAAP4FACCtAgAA_wUAILMCAAABACAAAAALHAAA0QUAMB0AANUFADCtAgAA0gUAMK4CAADTBQAwrwIAANQFACCwAgAAkgQAMLECAACSBAAwsgIAAJIEADCzAgAAkgQAMLQCAADWBQAwtQIAAJsEADALHAAAyAUAMB0AAMwFADCtAgAAyQUAMK4CAADKBQAwrwIAAMsFACCwAgAA-wQAMLECAAD7BAAwsgIAAPsEADCzAgAA-wQAMLQCAADNBQAwtQIAAP4EADALHAAAvAUAMB0AAMEFADCtAgAAvQUAMK4CAAC-BQAwrwIAAL8FACCwAgAAwAUAMLECAADABQAwsgIAAMAFADCzAgAAwAUAMLQCAADCBQAwtQIAAMMFADALHAAAsAUAMB0AALUFADCtAgAAsQUAMK4CAACyBQAwrwIAALMFACCwAgAAtAUAMLECAAC0BQAwsgIAALQFADCzAgAAtAUAMLQCAAC2BQAwtQIAALcFADALHAAApAUAMB0AAKkFADCtAgAApQUAMK4CAACmBQAwrwIAAKcFACCwAgAAqAUAMLECAACoBQAwsgIAAKgFADCzAgAAqAUAMLQCAACqBQAwtQIAAKsFADALHAAAmAUAMB0AAJ0FADCtAgAAmQUAMK4CAACaBQAwrwIAAJsFACCwAgAAnAUAMLECAACcBQAwsgIAAJwFADCzAgAAnAUAMLQCAACeBQAwtQIAAJ8FADAKBAAAjAUAIAYAAI0FACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGSAhAAAAABowIBAAAAAaQCAQAAAAGlAiAAAAABpgIgAAAAAQIAAAA2ACAcAACjBQAgAwAAADYAIBwAAKMFACAdAACiBQAgARcAAP0FADAPAwAAtQMAIAQAALMDACAGAAC0AwAg7AEAALEDADDtAQAACQAQ7gEAALEDADDvAQEAAAAB8wFAAI8DACH0AUAAkAMAIYoCAQCMAwAhkgIQAI0DACGjAgEAjAMAIaQCAQCOAwAhpQIgALIDACGmAiAAsgMAIQIAAAA2ACAXAACiBQAgAgAAAKAFACAXAAChBQAgDOwBAACfBQAw7QEAAKAFABDuAQAAnwUAMO8BAQCMAwAh8wFAAI8DACH0AUAAkAMAIYoCAQCMAwAhkgIQAI0DACGjAgEAjAMAIaQCAQCOAwAhpQIgALIDACGmAiAAsgMAIQzsAQAAnwUAMO0BAACgBQAQ7gEAAJ8FADDvAQEAjAMAIfMBQACPAwAh9AFAAJADACGKAgEAjAMAIZICEACNAwAhowIBAIwDACGkAgEAjgMAIaUCIACyAwAhpgIgALIDACEI7wEBANMDACHzAUAA1gMAIfQBQADXAwAhkgIQANQDACGjAgEA0wMAIaQCAQDVAwAhpQIgAOQDACGmAiAA5AMAIQoEAAD0BAAgBgAA9QQAIO8BAQDTAwAh8wFAANYDACH0AUAA1wMAIZICEADUAwAhowIBANMDACGkAgEA1QMAIaUCIADkAwAhpgIgAOQDACEKBAAAjAUAIAYAAI0FACDvAQEAAAAB8wFAAAAAAfQBQAAAAAGSAhAAAAABowIBAAAAAaQCAQAAAAGlAiAAAAABpgIgAAAAAQTvAQEAAAAB8wFAAAAAAfQBQAAAAAGZAhAAAAABAgAAADMAIBwAAK8FACADAAAAMwAgHAAArwUAIB0AAK4FACABFwAA_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_gUAIAjvAQEAAAAB8wFAAAAAAfQBQAAAAAGEAgEAAAABhQICAAAAAYoCAQAAAAGSAhAAAAABlwIBAAAAAQnvAQEAAAAB8wFAAAAAAfQBQAAAAAGKAgEAAAABkgIQAAAAAZMCAQAAAAGUAhAAAAABlQIBAAAAAZYCAQAAAAEDAAAABwAgHAAA_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-MgA7MwA8AAAAAAAFBwA6IgA9IwA-MgA7MwA8BQcAQSIARCMARTIAQjMAQwAAAAAABQcAQSIARCMARTIAQjMAQwADBwBJIgBKIwBLAAAAAwcASSIASiMASwADBwBPIgBQIwBRAAAAAwcATyIAUCMAUQMHAFQiAFUjAFYAAAADBwBUIgBVIwBWAwcAWSIAWiMAWwAAAAMHAFkiAFojAFsABQcAXyIAYiMAYzIAYDMAYQAAAAAABQcAXyIAYiMAYzIAYDMAYQAFBwBnIgBqIwBrMgBoMwBpAAAAAAAFBwBnIgBqIwBrMgBoMwBpBQcAbiIAcSMAcjIAbzMAcAAAAAAABQcAbiIAcSMAcjIAbzMAcBICARM-ARRAARVBARZCARhEARlGEhpIARtKEh5LAR9MASBNEiRQEyVRFyZSAydTAyhUAylVAypWAytYAyxaEi1cAy5eEi9fAzBgAzFhEjRkGDVlHjZmBzdnBzhoBzlpBzpqBztsBzxuEj1wBz5yEj9zB0B0B0F1EkJ4H0N5JUR6BkV7BkZ8Bkd9Bkh-BkmAAQZKggESS4QBBkyGARJNhwEGTogBBk-JARJQjAEmUY0BKlKOAQJTjwECVJABAlWRAQJWkgECV5QBAliWARJZmAECWpoBElubAQJcnAECXZ0BEl6gAStfoQExYKIBEGGjARBipAEQY6UBEGSmARBlqAEQZqoBEmesARBorgESaa8BEGqwARBrsQESbLQBMm21AThutgELb7cBC3C4AQtxuQELcroBC3O8AQt0vgESdcABC3bCARJ3wwELeMQBC3nFARJ6yAE5e8kBP3zKAQR9ywEEfswBBH_NAQSAAc4BBIEB0AEEggHSARKDAdQBBIQB1gEShQHXAQSGAdgBBIcB2QESiAHcAUCJAd0BRooB3wFHiwHgAUeMAeMBR40B5AFHjgHlAUePAecBR5AB6QESkQHrAUeSAe0BEpMB7gFHlAHvAUeVAfABEpYB8wFIlwH0AUyYAfYBTZkB9wFNmgH6AU2bAfsBTZwB_AFNnQH-AU2eAYACEp8BggJNoAGEAhKhAYUCTaIBhgJNowGHAhKkAYoCTqUBiwJSpgGMAg6nAY0CDqgBjgIOqQGPAg6qAZACDqsBkgIOrAGUAhKtAZYCDq4BmAISrwGZAg6wAZoCDrEBmwISsgGeAlOzAZ8CV7QBoAIPtQGhAg-2AaICD7cBowIPuAGkAg-5AaYCD7oBqAISuwGqAg-8AawCEr0BrQIPvgGuAg-_Aa8CEsABsgJYwQGzAlzCAbUCXcMBtgJdxAG5Al3FAboCXcYBuwJdxwG9Al3IAb8CEskBwQJdygHDAhLLAcQCXcwBxQJdzQHGAhLOAckCXs8BygJk0AHMAmXRAc0CZdIB0AJl0wHRAmXUAdICZdUB1AJl1gHWAhLXAdgCZdgB2gIS2QHbAmXaAdwCZdsB3QIS3AHgAmbdAeECbN4B4wII3wHkAgjgAecCCOEB6AII4gHpAgjjAesCCOQB7QIS5QHvAgjmAfECEucB8gII6AHzAgjpAfQCEuoB9wJt6wH4AnM"
};
async function decodeBase64AsWasm(wasmBase64) {
  const { Buffer: Buffer2 } = await import("buffer");
  const wasmArray = Buffer2.from(wasmBase64, "base64");
  return new WebAssembly.Module(wasmArray);
}
config.compilerWasm = {
  getRuntime: async () => await import("@prisma/client/runtime/query_compiler_fast_bg.mysql.mjs"),
  getQueryCompilerWasmModule: async () => {
    const { wasm } = await import("@prisma/client/runtime/query_compiler_fast_bg.mysql.wasm-base64.mjs");
    return await decodeBase64AsWasm(wasm);
  },
  importName: "./query_compiler_fast_bg.js"
};
function getPrismaClientClass() {
  return runtime.getPrismaClient(config);
}

// generated/prisma/internal/prismaNamespace.ts
import * as runtime2 from "@prisma/client/runtime/client";
var getExtensionContext = runtime2.Extensions.getExtensionContext;
var NullTypes2 = {
  DbNull: runtime2.NullTypes.DbNull,
  JsonNull: runtime2.NullTypes.JsonNull,
  AnyNull: runtime2.NullTypes.AnyNull
};
var TransactionIsolationLevel = runtime2.makeStrictEnum({
  ReadUncommitted: "ReadUncommitted",
  ReadCommitted: "ReadCommitted",
  RepeatableRead: "RepeatableRead",
  Serializable: "Serializable"
});
var defineExtension = runtime2.Extensions.defineExtension;

// generated/prisma/enums.ts
var GameSessionStatus = {
  UPCOMING: "UPCOMING",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED"
};

// generated/prisma/client.ts
globalThis["__dirname"] = path.dirname(fileURLToPath(import.meta.url));
var PrismaClient = getPrismaClientClass();

// lib/snowFlake.ts
var EPOCH = BigInt(
  process.env.SNOWFLAKE_EPOCH ?? "1577836800000"
);
var DATACENTER_ID = BigInt(
  process.env.SNOWFLAKE_DATACENTER_ID ?? "0"
);
var WORKER_ID = BigInt(
  process.env.SNOWFLAKE_WORKER_ID ?? "0"
);
if (DATACENTER_ID < 0n || DATACENTER_ID > 31n) {
  throw new RangeError(
    `SNOWFLAKE_DATACENTER_ID must be 0\u201331, got ${DATACENTER_ID}`
  );
}
if (WORKER_ID < 0n || WORKER_ID > 31n) {
  throw new RangeError(
    `SNOWFLAKE_WORKER_ID must be 0\u201331, got ${WORKER_ID}`
  );
}
var SEQUENCE_BITS = 12n;
var WORKER_BITS = 5n;
var DATACENTER_BITS = 5n;
var MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;
var WORKER_SHIFT = SEQUENCE_BITS;
var DATACENTER_SHIFT = SEQUENCE_BITS + WORKER_BITS;
var TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_BITS + DATACENTER_BITS;
var lastTimestamp = -1n;
var sequence = 0n;
function currentTimestamp() {
  return BigInt(Date.now()) - EPOCH;
}
function waitForNextMillis(last) {
  let ts = currentTimestamp();
  while (ts <= last) {
    ts = currentTimestamp();
  }
  return ts;
}
function generateSnowflakeId() {
  let ts = currentTimestamp();
  if (ts < lastTimestamp) {
    throw new Error(
      `Clock moved backwards. Refusing to generate IDs for ${lastTimestamp - ts} ms`
    );
  }
  if (ts === lastTimestamp) {
    sequence = sequence + 1n & MAX_SEQUENCE;
    if (sequence === 0n) {
      ts = waitForNextMillis(lastTimestamp);
    }
  } else {
    sequence = 0n;
  }
  lastTimestamp = ts;
  return ts << TIMESTAMP_SHIFT | DATACENTER_ID << DATACENTER_SHIFT | WORKER_ID << WORKER_SHIFT | sequence;
}
function generateSnowflakeIdString() {
  return generateSnowflakeId().toString();
}

// lib/prisma.ts
var adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  connectionLimit: 5
});
var prisma = new PrismaClient({ adapter }).$extends({
  query: {
    $allModels: {
      async create({ args, query }) {
        args.data.id = generateSnowflakeIdString();
        return query(args);
      },
      async createMany({ args, query }) {
        const records = Array.isArray(args.data) ? args.data : [args.data];
        records.forEach((r) => r.id = generateSnowflakeIdString());
        return query(args);
      },
      async upsert({ args, query }) {
        if (!args.create.id) {
          args.create.id = generateSnowflakeIdString();
        }
        return query(args);
      }
    }
  }
});

// controllers/user.controller.ts
var SALT_ROUNDS = 10;
var getUserById = async (id) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    const userAccount = await prisma.userAccount.findFirst({ where: { userId: id } });
    return user ? { ...user, balance: userAccount?.balance ?? 0 } : null;
  } catch {
    return { error: "An error occurred while fetching the user." };
  }
};
var getAllUsers = async (params) => {
  try {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const skip = (page - 1) * limit;
    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        skip,
        take: Number(limit),
        include: {
          userAccounts: true
        },
        orderBy: { createdAt: "desc" },
        omit: { password: true }
      }),
      prisma.user.count()
    ]);
    const formattedUsers = users.map((u) => ({ ...u, userAccounts: "", balance: u.userAccounts.reduce((total2, account) => {
      return total2 + Number(account.balance);
    }, 0) }));
    return {
      data: formattedUsers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (e) {
    console.log(e);
    return { error: "An error occurred while fetching users." };
  }
};
var createUser = async (params) => {
  try {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: params.email }, { phone: params.phone }] }
    });
    if (existing) {
      return { error: "A user with this email/phone  already exists." };
    }
    const hashedPassword = await bcrypt.hash(params.password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: params.email,
        name: params.name,
        phone: params.phone,
        password: hashedPassword,
        role: "USER",
        createdAt: /* @__PURE__ */ new Date()
      },
      omit: { password: true }
    });
    return user;
  } catch (e) {
    return { error: "An error occurred while creating the user." + e };
  }
};
var updateUser = async (id, params) => {
  try {
    console.log(params);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return { error: "User not found." };
    }
    if (params.email && params.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: params.email }
      });
      if (emailTaken) {
        return { error: "Email is already in use by another account." };
      }
      const phoneTaken = await prisma.user.findUnique({
        where: { phone: params.phone }
      });
      if (phoneTaken) {
        return { error: "Phone is already in use by another account." };
      }
    }
    if (params.phone && params.phone !== existing.phone) {
      const phoneTaken = await prisma.user.findUnique({
        where: { phone: params.phone }
      });
      if (phoneTaken) {
        return { error: "Phone is already in use by another account." };
      }
    }
    const user = await prisma.user.update({
      where: { id },
      data: { ...params, updatedAt: /* @__PURE__ */ new Date(), role: params.role ? params.role : existing.role },
      omit: { password: true }
    });
    return user;
  } catch (e) {
    console.log(e);
    return { error: "An error occurred while updating the user." };
  }
};
var updateUserPassword = async (id, newPassword) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return { error: "User not found." };
    }
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword, updatedAt: /* @__PURE__ */ new Date() }
    });
    return { success: true };
  } catch {
    return { error: "An error occurred while updating the password." };
  }
};
var deleteUser = async (id) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return { error: "User not found." };
    }
    await prisma.user.delete({ where: { id } });
    return { success: true };
  } catch {
    return { error: "An error occurred while deleting the user." };
  }
};
var verifyUserPassword = async (email, plainPassword) => {
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { error: "Invalid email or password." };
    }
    const isValid = await bcrypt.compare(plainPassword, user.password);
    if (!isValid) {
      return { error: "Invalid email or password." };
    }
    const userAccount = await prisma.userAccount.findFirst({ where: { userId: user.id } });
    const { password: _, ...userWithoutPassword } = user;
    return { ...userWithoutPassword, user_id: userWithoutPassword.id, balance: userAccount?.balance ?? 0 };
  } catch {
    return { error: "An error occurred while verifying the password." };
  }
};

// middleware/authenticate.ts
import jwt2 from "jsonwebtoken";
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set.");
}
var authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header." });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt2.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt2.TokenExpiredError) {
      return res.status(401).json({ error: "Token has expired." });
    }
    return res.status(401).json({ error: "Invalid token." });
  }
};
var authorizeOwner = (req, res, next) => {
  if (req.user?.id !== req.params.id) {
    return res.status(403).json({ error: "Forbidden: you can only modify your own account." });
  }
  next();
};

// middleware/validate.ts
import { z } from "zod";
var validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const message = result.error.issues.map((e) => `${e.message}`).join(", ");
    return res.status(400).json({ error: message });
  }
  if (source === "query" || source === "params") {
    Object.assign(req[source], result.data);
  } else {
    req[source] = result.data;
  }
  next();
};
var createUserSchema = z.object({
  email: z.string().email("Invalid email address."),
  name: z.string().min(2, "Name must be at least 2 characters."),
  phone: z.string().regex(/^\+?[0-9]\d{6,14}$/, "Invalid phone number."),
  password: z.string().min(8, "Password must be at least 8 characters.").regex(/[A-Z]/, "Password must contain at least one uppercase letter.").regex(/[0-9]/, "Password must contain at least one number.")
});
var loginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(1, "Password is required.")
});
var updateUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").optional(),
  phone: z.string().regex(/^\+?[0-9]\d{6,14}$/, "Invalid phone number.").optional(),
  email: z.string().email("Invalid email address.").optional(),
  role: z.string().optional(),
  isActive: z.boolean()
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided."
});
var updatePasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters.").regex(/[A-Z]/, "Password must contain at least one uppercase letter.").regex(/[0-9]/, "Password must contain at least one number.")
});
var paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});

// routes/user.routes.ts
var router = Router();
router.post(
  "/",
  validate(createUserSchema),
  async (req, res) => {
    const { email, name, phone, password } = req.body;
    const result = await createUser({ email, name, phone, password });
    if ("error" in result) {
      if (result.error.includes("already exists")) {
        return res.status(409).json(result);
      }
      return res.status(500).json(result);
    }
    return res.status(201).json(result);
  }
);
router.post(
  "/login",
  validate(loginSchema),
  async (req, res) => {
    const { email, password } = req.body;
    const result = await verifyUserPassword(email, password);
    if ("error" in result) {
      return res.status(401).json(result);
    }
    const token = jwt3.sign(
      { id: result.id, email: result.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    const refreshToken = jwt3.sign(
      { id: result.id, email: result.email },
      process.env.JWT_SECRET_REFRESH,
      { expiresIn: "30d" }
    );
    return res.status(200).cookie("refresh_token", refreshToken, {
      maxAge: 30 * 24 * 60 * 60 * 1e3,
      httpOnly: true,
      sameSite: "none",
      secure: true
    }).json({ ...result, token, refreshToken });
  }
);
router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token not found." });
  }
  try {
    const decoded = jwt3.verify(
      refreshToken,
      process.env.JWT_SECRET_REFRESH
    );
    const user = await getUserById(decoded.id);
    if (!user || "error" in user) {
      return res.status(401).json({ error: "User not found." });
    }
    const token = jwt3.sign(
      { id: decoded.id, email: decoded.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    const { password, ...userWithoutPassword } = user;
    return res.status(200).json({ token, ...userWithoutPassword });
  } catch (error) {
    return res.status(401).json({ error: "Invalid refresh token." });
  }
});
router.post("/logout", authenticate, async (req, res) => {
  return res.status(200).clearCookie("refresh_token", {
    httpOnly: true,
    sameSite: "none",
    secure: true
  }).json({ message: "Logged out successfully." });
});
router.get(
  "/",
  authenticate,
  validate(paginationSchema, "query"),
  async (req, res) => {
    const { page, limit } = req.query;
    const result = await getAllUsers({ page, limit });
    if ("error" in result) {
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  }
);
router.get("/:id", authenticate, async (req, res) => {
  const id = req.params.id;
  const result = await getUserById(id);
  if (!result) {
    return res.status(404).json({ error: "User not found." });
  }
  if ("error" in result) {
    return res.status(500).json(result);
  }
  return res.status(200).json(result);
});
router.patch(
  "/:id",
  authenticate,
  validate(updateUserSchema),
  async (req, res) => {
    const id = req.params.id;
    const { name, phone, email, role, isActive } = req.body;
    if (req.user?.id == req.params.id && isActive == false) {
      return res.status(403).json({
        error: "Forbidden: you can't deactivate your current account."
      });
    }
    const result = await updateUser(id, { name, phone, email, role, isActive });
    if ("error" in result) {
      if (result.error === "User not found.") {
        return res.status(404).json(result);
      }
      if (result.error.includes("already in use")) {
        return res.status(409).json(result);
      }
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  }
);
router.patch(
  "/:id/password",
  authenticate,
  authorizeOwner,
  validate(updatePasswordSchema),
  async (req, res) => {
    const id = req.params.id;
    const { password } = req.body;
    const result = await updateUserPassword(id, password);
    if ("error" in result) {
      if (result.error === "User not found.") {
        return res.status(404).json(result);
      }
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  }
);
router.delete(
  "/:id",
  authenticate,
  // authorizeOwner,
  async (req, res) => {
    if (req.user?.id == req.params.id) {
      return res.status(403).json({ error: "Forbidden: you can't delete your own account." });
    }
    const id = req.params.id;
    const result = await deleteUser(id);
    if ("error" in result) {
      if (result.error === "User not found.") {
        return res.status(404).json(result);
      }
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  }
);
var user_routes_default = router;

// routes/session.routes.ts
import { Router as Router2 } from "express";

// controllers/session.controller.ts
var getGameSessions = async (params) => {
  try {
    const page = params?.page || 1;
    const limit = params?.limit || 10;
    const where = {
      ...params.status && { status: params.status },
      ...params.search && {
        OR: [{ id: { contains: params.search } }]
      },
      ...params.dateFrom && params.dateTo && {
        createdAt: {
          gte: new Date(params.dateFrom),
          lte: new Date(params.dateTo)
        }
      }
    };
    const [sessions, total] = await prisma.$transaction([
      prisma.gameSession.findMany({
        where,
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { sessionNumber: "asc" },
        include: {
          multiplier: true
        }
      }),
      prisma.gameSession.count({ where })
    ]);
    return {
      data: sessions,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    };
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while fetching game sessions" };
  }
};
var getGameSessionById = async (id) => {
  try {
    const session = await prisma.gameSession.findUnique({ where: { id } });
    if (!session) throw { error: "Game session not found" };
    return session;
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while fetching the game session" };
  }
};
var createSession = async (params) => {
  try {
    const maxSessionNumber = await prisma.gameSession.aggregate({
      _max: { sessionNumber: true }
    });
    const nextSessionNumber = (maxSessionNumber._max.sessionNumber || 0) + 1;
    const session = await prisma.gameSession.create({
      data: {
        duration: params.duration,
        shouldWin: params.shouldWin,
        multiplierId: params.multiplierId,
        sessionNumber: nextSessionNumber
      }
    });
    return session;
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while creating the session." };
  }
};
var updateSession = async (id, params) => {
  try {
    const { multiplier: _, ...updateData } = params;
    const session = await prisma.gameSession.update({
      where: { id },
      data: updateData
    });
    return session;
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while updating the session." };
  }
};
var deleteSession = async (id) => {
  try {
    await prisma.gameSession.delete({ where: { id } });
    return { success: true };
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while deleting the session." };
  }
};
var reorderSessions = async (sessionOrders) => {
  if (!sessionOrders || sessionOrders.length === 0) {
    throw { error: "sessionOrders array is required and cannot be empty" };
  }
  for (const order of sessionOrders) {
    if (!order.id || typeof order.sessionNumber !== "number") {
      throw { error: "Each order must have an id and a numeric sessionNumber" };
    }
  }
  try {
    const TEMP_HOLDER = -999999;
    const results = await prisma.$transaction(
      async (tx) => {
        const updated = [];
        for (const order of sessionOrders) {
          const occupyingSession = await tx.gameSession.findFirst({
            where: {
              sessionNumber: order.sessionNumber,
              id: { not: order.id }
            }
          });
          if (occupyingSession) {
            await tx.gameSession.update({
              where: { id: occupyingSession.id },
              data: { sessionNumber: TEMP_HOLDER }
            });
          }
          const updatedSession = await tx.gameSession.update({
            where: { id: order.id },
            data: { sessionNumber: order.sessionNumber }
          });
          updated.push(updatedSession);
          if (occupyingSession) {
            const newHome = sessionOrders.find(
              (o) => o.id === occupyingSession.id
            );
            if (newHome) {
              await tx.gameSession.update({
                where: { id: occupyingSession.id },
                data: { sessionNumber: newHome.sessionNumber }
              });
            }
          }
        }
        return updated;
      },
      { maxWait: 6e4, timeout: 6e4 }
    );
    return { success: true, data: results };
  } catch (error) {
    console.error("Reorder sessions error:", error);
    throw { error: "Failed to reorder sessions" };
  }
};
var getActiveSession = async (userId) => {
  try {
    const active = await prisma.betSession.findFirst({
      where: { status: GameSessionStatus.ACTIVE },
      include: { session: { include: { multiplier: true } } }
    });
    if (!active) return null;
    const [myBets, myTicketBets] = await Promise.all([
      prisma.gameBet.findMany({
        where: { sessionId: active.id, userId }
      }),
      prisma.gameBet.findMany({
        where: {
          sessionId: active.id,
          ticket: { userId }
        }
      })
    ]);
    const allBets = [...myBets, ...myTicketBets];
    return { ...active, betted: allBets.length > 0, myBets: allBets };
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while fetching the active session." };
  }
};

// routes/session.routes.ts
var router2 = Router2();
router2.get("/sessions", authenticate, async (req, res) => {
  try {
    const sessions = await getGameSessions(req.query);
    return res.json(sessions);
  } catch (error) {
    return res.status(500).json({ error: "Unable to fetch game sessions" });
  }
});
router2.get("/sessions/active", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const session = await getActiveSession(userId);
    return res.json(session);
  } catch (error) {
    console.error(error);
    return res.status(404).json({ error });
  }
});
router2.get("/sessions/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const session = await getGameSessionById(id);
    return res.json(session);
  } catch (error) {
    return res.status(404).json({ error: "Game session not found" });
  }
});
router2.post("/sessions", authenticate, async (req, res) => {
  try {
    const { duration, shouldWin, multiplier } = req.body;
    console.log(req.body);
    if (duration === void 0 || shouldWin === void 0 || multiplier === void 0) {
      return res.status(400).json({ error: "duration, shouldWin, and multiplier are required" });
    }
    const session = await createSession({
      duration,
      shouldWin,
      multiplierId: multiplier
    });
    return res.status(201).json(session);
  } catch (error) {
    return res.status(500).json({ error: "Unable to create game session" });
  }
});
router2.patch("/sessions/reorder", authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }
    const result = await reorderSessions(ids);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Unable to reorder game sessions" });
  }
});
router2.patch("/sessions/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const session = await updateSession(id, {
      ...req.body,
      multiplierId: req.body.multiplier
    });
    return res.json(session);
  } catch (error) {
    return res.status(500).json({ error: "Unable to update game session" });
  }
});
router2.delete("/sessions/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    await deleteSession(id);
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Unable to delete game session" });
  }
});
var session_routes_default = router2;

// routes/targetNumber.routes.ts
import { Router as Router3 } from "express";

// controllers/targetNumber.controller.ts
var getTargetNumberById = async (id) => {
  try {
    const targetNumber = await prisma.gameTargetNumber.findUnique({ where: { id } });
    return targetNumber ?? null;
  } catch {
    return { error: "An error occurred while fetching the targetNumber." };
  }
};
var getAllTargetNumbers = async (params) => {
  try {
    const [targetNumbers, total] = await prisma.$transaction([
      prisma.gameTargetNumber.findMany({
        orderBy: { targetNumber: "asc" }
      }),
      prisma.gameTargetNumber.count()
    ]);
    return {
      data: targetNumbers,
      meta: {
        total,
        totalPages: Math.ceil(total)
      }
    };
  } catch {
    return { error: "An error occurred while fetching targetNumbers." };
  }
};
var createTargetNumber = async (params) => {
  try {
    const existing = await prisma.gameTargetNumber.findMany({
      where: { targetNumber: params.number }
    });
    if (existing.length > 0) {
      return { error: "A targetNumber with this number already exists." };
    }
    const targetNumber = await prisma.gameTargetNumber.create({
      data: {
        targetNumber: params.number,
        multiplierNumber: params.multiplierNumber ?? 0,
        color: params.color
      }
    });
    return targetNumber;
  } catch {
    return { error: "An error occurred while creating the targetNumber." };
  }
};
var updateTarget = async (id, params) => {
  try {
    const existing = await prisma.gameTargetNumber.findUnique({
      where: { id }
    });
    if (!existing) {
      return { error: "TargetNumber not found." };
    }
    const targetNumber = await prisma.gameTargetNumber.update({
      where: { id },
      data: { targetNumber: Number(params.number), color: params.color, multiplierNumber: params.multiplierNumber }
    });
    return targetNumber;
  } catch (error) {
    console.log(error);
    return { error: "An error occurred while updating the targetNumber." };
  }
};
var deleteTargetNumber = async (id) => {
  try {
    const existing = await prisma.gameTargetNumber.findUnique({ where: { id } });
    if (!existing) {
      return { error: "TargetNumber not found." };
    }
    await prisma.gameTargetNumber.delete({ where: { id } });
    return { success: true };
  } catch {
    return { error: "An error occurred while deleting the targetNumber." };
  }
};

// routes/targetNumber.routes.ts
var router3 = Router3();
router3.post(
  "/numbers/",
  async (req, res) => {
    const { number, color, multiplierNumber } = req.body;
    const result = await createTargetNumber({ number, color, multiplierNumber });
    if ("error" in result) {
      if (result.error.includes("already exists")) {
        return res.status(409).json(result);
      }
      return res.status(500).json(result);
    }
    return res.status(201).json(result);
  }
);
router3.get(
  "/numbers/",
  authenticate,
  async (req, res) => {
    const { page, limit } = req.query;
    const result = await getAllTargetNumbers({ page, limit });
    if ("error" in result) {
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  }
);
router3.get("/numbers/:id", authenticate, async (req, res) => {
  const id = req.params.id;
  const result = await getTargetNumberById(id);
  if (!result) {
    return res.status(404).json({ error: "TargetNumber not found." });
  }
  if ("error" in result) {
    return res.status(500).json(result);
  }
  return res.status(200).json(result);
});
router3.patch("/numbers/:id", authenticate, async (req, res) => {
  const { number, color, multiplierNumber } = req.body;
  const id = req.params.id;
  const result = await updateTarget(id, { number, color, multiplierNumber });
  if ("error" in result) {
    if (result.error.includes("already exists")) {
      return res.status(409).json(result);
    }
    return res.status(500).json(result);
  }
  return res.status(201).json(result);
});
router3.delete(
  "/numbers/:id",
  authenticate,
  async (req, res) => {
    const id = req.params.id;
    const result = await deleteTargetNumber(id);
    if ("error" in result) {
      if (result.error === "TargetNumber not found.") {
        return res.status(404).json(result);
      }
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  }
);
var targetNumber_routes_default = router3;

// routes/multipliers.routes.ts
import { Router as Router4 } from "express";

// controllers/multiplier.controller.ts
var getMultiplierById = async (id) => {
  try {
    const multiplier = await prisma.gameWinMultiplier.findUnique({
      where: { id }
    });
    return multiplier ?? null;
  } catch {
    return { error: "An error occurred while fetching the multiplier." };
  }
};
var getAllMultipliers = async () => {
  try {
    const [multipliers, total] = await prisma.$transaction([
      prisma.gameWinMultiplier.findMany({
        orderBy: { multiplierLetter: "asc" }
      }),
      prisma.gameWinMultiplier.count()
    ]);
    return {
      data: multipliers
    };
  } catch {
    return { error: "An error occurred while fetching multipliers." };
  }
};
var createMultiplier = async (params) => {
  try {
    const existing = await prisma.gameWinMultiplier.findMany({
      where: {
        AND: [
          { multiplierLetter: params.label }
        ]
      }
    });
    if (existing.length > 0) {
      return { error: "A multiplier already exists." };
    }
    const multiplier = await prisma.gameWinMultiplier.create({
      data: {
        multiplierLetter: params.label,
        winMultiplier: params.value,
        color: params.color
      }
    });
    return multiplier;
  } catch (e) {
    return { error: "An error occurred while creating the multiplier." + e };
  }
};
var updateMultiplier = async (id, params) => {
  try {
    const existing = await prisma.gameWinMultiplier.findUnique({
      where: { id }
    });
    if (!existing) {
      return { error: "Multiplier not found." };
    }
    const multiplier = await prisma.gameWinMultiplier.update({
      where: { id },
      data: { multiplierLetter: params.label, winMultiplier: params.value, color: params.color }
    });
    return multiplier;
  } catch {
    return { error: "An error occurred while updating the multiplier." };
  }
};
var deleteMultiplier = async (id) => {
  try {
    const existing = await prisma.gameWinMultiplier.findUnique({
      where: { id }
    });
    if (!existing) {
      return { error: "Multiplier not found." };
    }
    await prisma.gameWinMultiplier.delete({ where: { id } });
    return { success: true };
  } catch {
    return { error: "An error occurred while deleting the multiplier." };
  }
};

// routes/multipliers.routes.ts
var router4 = Router4();
router4.post(
  "/multipliers/",
  async (req, res) => {
    const { label, value, color } = req.body;
    const result = await createMultiplier({ label, value, color });
    if ("error" in result) {
      if (result.error.includes("already exists")) {
        return res.status(409).json(result);
      }
      return res.status(500).json(result);
    }
    return res.status(201).json(result);
  }
);
router4.get(
  "/multipliers/",
  authenticate,
  async (req, res) => {
    const result = await getAllMultipliers();
    if ("error" in result) {
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  }
);
router4.get("/multipliers/:id", authenticate, async (req, res) => {
  const id = req.params.id;
  const result = await getMultiplierById(id);
  if (!result) {
    return res.status(404).json({ error: "Multipliers not found." });
  }
  if ("error" in result) {
    return res.status(500).json(result);
  }
  return res.status(200).json(result);
});
router4.delete(
  "/multipliers/:id",
  authenticate,
  async (req, res) => {
    const id = req.params.id;
    const result = await deleteMultiplier(id);
    if ("error" in result) {
      if (result.error === "Multipliers not found.") {
        return res.status(404).json(result);
      }
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  }
);
router4.patch("/multipliers/:id", authenticate, async (req, res) => {
  const { label, value, color } = req.body;
  const id = req.params.id;
  const result = await updateMultiplier(id, { label, value, color });
  if ("error" in result) {
    if (result.error.includes("already exists")) {
      return res.status(409).json(result);
    }
    return res.status(500).json(result);
  }
  return res.status(201).json(result);
});
var multipliers_routes_default = router4;

// routes/transaction.routes.ts
import { Router as Router5 } from "express";

// classes/PaymentSystem.ts
import axios from "axios";
function loadConfigFromEnv() {
  const apiUrl = process.env.PAYMENT_API_URL;
  const cardRedirectUrl = process.env.PAYMENT_CARD_REDIRECT_URL;
  const appKey = process.env.PAYMENT_APP_KEY;
  const secretKey = process.env.PAYMENT_SECRET_KEY;
  if (!apiUrl || !cardRedirectUrl || !appKey || !secretKey) {
    throw new Error(
      "Missing required env vars. Check your .env file against .env.example.\nRequired: PAYMENT_API_URL, PAYMENT_CARD_REDIRECT_URL, PAYMENT_APP_KEY, PAYMENT_SECRET_KEY"
    );
  }
  return {
    apiUrl,
    cardRedirectUrl,
    appKey,
    secretKey,
    timeoutMs: process.env.PAYMENT_REQUEST_TIMEOUT_MS ? parseInt(process.env.PAYMENT_REQUEST_TIMEOUT_MS, 10) : 15e3
  };
}
var PaymentSystem = class {
  cardRedirectUrl;
  config;
  http;
  constructor(config2) {
    this.config = config2;
    this.cardRedirectUrl = config2.cardRedirectUrl;
    const authToken = Buffer.from(
      `${config2.appKey}:${config2.secretKey}`
    ).toString("base64");
    this.http = axios.create({
      baseURL: config2.apiUrl,
      timeout: config2.timeoutMs ?? 15e3,
      headers: {
        Authorization: `Basic ${authToken}`,
        "Content-Type": "application/json"
      }
    });
  }
  async makeRequest(method, data = {}) {
    try {
      const response = method === "GET" ? await this.http.get("", { params: data }) : await this.http.request({
        method,
        data
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          status: false,
          message: error.message,
          data: error.response?.data
        };
      }
      return {
        status: false,
        message: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async initiatePayment(userInfo) {
    const referenceId = generateSnowflakeIdString();
    const payload = {
      email: userInfo.email,
      name: userInfo.name,
      payer_phone: userInfo.phone,
      amount: userInfo.amount,
      payment_method: userInfo.paymentMethod ?? "MTN_MOMO_RWA",
      service_paid: userInfo.servicePaid ?? "payment",
      reference_id: referenceId,
      callback_url: userInfo.callbackUrl ?? process.env.PAYMENT_CALLBACK_URL ?? "",
      action: "pay"
    };
    const response = await this.makeRequest("POST", payload);
    const returnedRef = response.data?.["reference_id"] ?? response.data?.["refid"] ?? response?.["reference_id"] ?? referenceId;
    return {
      success: response.status === true,
      referenceId: returnedRef ?? null,
      transactionId: response.data?.["transaction_id"] ?? null,
      status: response.data?.["status"] ?? "PENDING",
      message: response.message ?? (response.status ? "Payment initiated" : "Payment failed"),
      raw: response
    };
  }
  async pay(payload) {
    return this.makeRequest("POST", { ...payload, action: "pay" });
  }
  async getPayment(referenceId) {
    return this.makeRequest("GET", { reference_id: referenceId });
  }
  receiveCallback(raw2) {
    if (!isValidCallback(raw2)) {
      return { status: false, message: "Invalid callback payload" };
    }
    const { reference_id, transaction_id, status, action } = raw2;
    console.info("[PaymentSystem] Callback received", {
      reference_id,
      transaction_id,
      status,
      action
    });
    return {
      status: true,
      message: "Callback processed successfully",
      data: { reference_id, transaction_id, status, action }
    };
  }
};
function isValidCallback(raw2) {
  if (typeof raw2 !== "object" || raw2 === null) return false;
  const cb = raw2;
  return typeof cb["reference_id"] === "string" && typeof cb["transaction_id"] === "string" && typeof cb["status"] === "string" && typeof cb["action"] === "string";
}

// validation/validatePhone.ts
function parseRwandaPhone(raw2) {
  const digits = raw2.replace(/\D/g, "");
  const match = digits.match(/^(?:250)?(0?)(7\d{8})$/);
  if (!match) {
    throw new Error(`Invalid Rwandan phone number: "${raw2}"`);
  }
  return `+250${match[2]}`;
}

// controllers/transaction.controller.ts
var getTransactions = async (params) => {
  const page = params.page || 1;
  const limit = params.limit || 10;
  const where = {
    ...params.userId && { userId: params.userId },
    ...params.type && { type: params.type },
    ...params.dateFrom && params.dateTo && {
      createdAt: {
        gte: new Date(params.dateFrom),
        lte: new Date(params.dateTo)
      }
    }
  };
  const [data, total, aggregates] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * Number(limit),
      take: Number(limit)
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({
      where,
      _sum: {
        amount: true
      }
    })
  ]);
  const [betTotals, payoutTotals] = await prisma.$transaction([
    prisma.transaction.aggregate({
      where: { ...where, type: "BET" },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { ...where, type: "PAYOUT" },
      _sum: { amount: true }
    })
  ]);
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / Number(limit))
    },
    totals: {
      overallAmount: aggregates._sum.amount || 0,
      totalBets: betTotals._sum.amount || 0,
      totalPayouts: payoutTotals._sum.amount || 0
    }
  };
};
var getMyTransactions = async (params) => getTransactions({
  ...params,
  userId: params.userId
});
var createDeposit = async (params) => {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw { error: "Amount must be greater than 0." };
  }
  if (params.amount > 1e6) {
    throw {
      error: "Deposit would exceed maximum balance limit of 1,000,000."
    };
  }
  const user = await prisma.user.findFirst({ where: { id: params.userId } });
  if (!user) {
    throw { error: "The Deposit user not found in the system" };
  }
  if (!user.phone) {
    throw { error: "User phone number is required to proceed the operation" };
  }
  const rawPhone = params.phoneNumber && params.phoneNumber.length > 5 ? params.phoneNumber : user.phone;
  const paymentPhone = parseRwandaPhone(rawPhone);
  const ps = new PaymentSystem(loadConfigFromEnv());
  const result = await ps.initiatePayment({
    email: user.email,
    name: user.name,
    phone: paymentPhone,
    amount: params.amount,
    paymentMethod: params.provider === "MOMO" ? "MTN_MOMO_RWA" : "AIRTEL_MONEY_RWA",
    servicePaid: "payment"
  });
  if (!result.success) {
    throw { error: result.message ?? "Payment initiation failed." };
  }
  const transactionId = result.transactionId;
  const referenceId = result.referenceId;
  return prisma.$transaction(
    async (tx) => {
      const updatedAccount = await tx.userAccount.upsert({
        where: { userId: params.userId },
        update: { balance: { increment: params.amount } },
        create: { userId: params.userId, balance: params.amount },
        select: { balance: true }
      });
      if (Number(updatedAccount.balance) > 1e6) {
        throw {
          error: "Deposit would exceed maximum balance limit of 1,000,000."
        };
      }
      const txRecord = await tx.transaction.create({
        data: {
          userId: params.userId,
          amount: params.amount,
          exTransactionId: transactionId,
          reference_id: referenceId,
          type: "DEPOSIT",
          tax: 0
        }
      });
      return {
        ...txRecord,
        balance: updatedAccount.balance,
        meta: { provider: params.provider }
      };
    },
    { timeout: 15e3, maxWait: 15e3 }
  );
};
var createWithdrawal = async (params) => {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw { error: "Amount must be greater than 0." };
  }
  const userBalance = await prisma.userAccount.findUnique({
    where: { userId: params.userId },
    select: { balance: true }
  });
  const balance = Number(userBalance?.balance ?? 0);
  if (balance < params.amount) {
    throw { error: "Insufficient balance for withdrawal." };
  }
  const updatedBalance = balance - params.amount;
  await prisma.userAccount.upsert({
    where: { userId: params.userId },
    update: { balance: updatedBalance },
    create: {
      userId: params.userId,
      balance: updatedBalance
    }
  });
  const tx = await prisma.transaction.create({
    data: {
      userId: params.userId,
      amount: -Math.abs(params.amount),
      type: "WITHDRAWAL",
      tax: 0
    }
  });
  return {
    ...tx,
    balance: updatedBalance,
    meta: { provider: params.provider }
  };
};
var getBalance = async (params) => {
  const userBalance = await prisma.userAccount.findUnique({
    where: { userId: params.userId },
    select: { balance: true }
  });
  return Number(userBalance?.balance ?? 0);
};

// routes/transaction.routes.ts
var router5 = Router5();
router5.get("/transactions", authenticate, async (req, res) => {
  try {
    const data = await getTransactions(req.query);
    res.json(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch transactions." });
  }
});
router5.get("/transactions/me", authenticate, async (req, res) => {
  try {
    const data = await getMyTransactions({
      ...req.query,
      userId: req.user.id
    });
    res.json(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Failed to fetch your transactions." });
  }
});
router5.post("/transactions/deposit", authenticate, async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const provider = req.body?.provider;
    const userId = req.body?.userId;
    const phoneNumber = req.body.phoneNumber;
    if (!["MOMO", "AIRTEL_MONEY"].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider." });
    }
    const tx = await createDeposit({
      userId,
      amount,
      provider,
      phoneNumber
    });
    res.status(201).json(tx);
  } catch (error) {
    console.log(error);
    const status = error?.error ? 400 : 500;
    res.status(status).json(error?.error ? error : { error: "Deposit failed." });
  }
});
router5.get("/transactions/balance", authenticate, async (req, res) => {
  try {
    const balance = await getBalance({
      userId: req.user.id
    });
    res.status(201).json(balance);
  } catch (error) {
    const status = error?.error ? 400 : 500;
    res.status(status).json(error?.error ? error : { error: "Deposit failed." });
  }
});
router5.post("/transactions/withdraw", authenticate, async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const provider = req.body?.provider;
    if (!["MOMO", "AIRTEL_MONEY"].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider." });
    }
    const tx = await createWithdrawal({
      userId: req.user.id,
      amount,
      provider
    });
    res.status(201).json(tx);
  } catch (error) {
    const status = error?.error ? 400 : 500;
    res.status(status).json(error?.error ? error : { error: "Withdrawal failed." });
  }
});
var transaction_routes_default = router5;

// routes/financialSettings.routes.ts
import { Router as Router6 } from "express";

// controllers/financialSetting.controller.ts
var getFinancialSettings = async () => {
  const settings = await prisma.gameFinancialSetting.findFirst({
    orderBy: { createdAt: "desc" }
  });
  if (!settings) throw { error: "No financial settings configured." };
  return settings;
};
var upsertFinancialSettings = async (params) => {
  const existing = await prisma.gameFinancialSetting.findFirst({
    orderBy: { createdAt: "desc" }
  });
  if (existing) {
    return prisma.gameFinancialSetting.update({
      where: { id: existing.id },
      data: params
    });
  }
  return prisma.gameFinancialSetting.create({ data: params });
};

// routes/financialSettings.routes.ts
var router6 = Router6();
router6.get("/settings/financial", authenticate, async (req, res) => {
  try {
    res.json(await getFinancialSettings());
  } catch (error) {
    console.log(error);
    res.status(404).json(error);
  }
});
router6.put("/settings/financial", authenticate, async (req, res) => {
  try {
    const { minBetAmount, maxBetAmount, taxPercentage, houseEdgePercentage } = req.body;
    if (minBetAmount == null || maxBetAmount == null || taxPercentage == null || houseEdgePercentage == null) {
      return res.status(400).json({ error: "All financial fields are required." });
    }
    res.json(await upsertFinancialSettings(req.body));
  } catch (error) {
    res.status(500).json({ error: "Failed to save financial settings." });
  }
});
var financialSettings_routes_default = router6;

// routes/bet.routes.ts
import { Router as Router7 } from "express";

// controllers/bet.controller.ts
import { Decimal as Decimal2 } from "@prisma/client/runtime/client";

// ws/gameEvents.ts
var GAME_ROOM = "game";
async function emitGameEvent(type, payload) {
  const message = {
    type,
    ...payload,
    ts: Date.now()
  };
  switch (type) {
    case "bet_placed" /* BET_PLACED */: {
      if (typeof payload.userId === "string") {
        await sendToUser(payload.userId, GAME_ROOM, message);
      }
      break;
    }
    default: {
      await broadcastToRoom(GAME_ROOM, message);
      break;
    }
  }
  await redis.setex(`game:state:${GAME_ROOM}`, 3600, JSON.stringify(message));
}

// controllers/bet.controller.ts
var placeBet = async (params) => {
  const numbers = params.targetNumbers.filter((n) => !isNaN(Number(n)));
  const letters = params.targetNumbers.filter((n) => isNaN(Number(n)));
  const settings = await prisma.gameFinancialSetting.findFirst({
    orderBy: { createdAt: "desc" }
  });
  if (!settings) throw { error: "Financial settings not configured." };
  const numbersOdds = await prisma.gameTargetNumber.findMany({
    where: { targetNumber: { in: numbers.map((n) => Number(n)) } }
  });
  const lettersOdds = await prisma.gameWinMultiplier.findMany({
    where: { multiplierLetter: { in: letters } }
  });
  const combinedOdds = [
    ...numbersOdds.map((n) => ({
      bettedValue: String(n.targetNumber),
      multiplier: n.multiplierNumber
    })),
    ...lettersOdds.map((l) => ({
      bettedValue: String(l.multiplierLetter),
      multiplier: l.winMultiplier
    }))
  ];
  const amount = new Decimal2(params.amount).mul(combinedOdds.length);
  if (amount.lessThan(settings.minBetAmount))
    throw { error: `Minimum bet amount is ${settings.minBetAmount}.` };
  if (amount.greaterThan(settings.maxBetAmount))
    throw { error: `Maximum bet amount is ${settings.maxBetAmount}.` };
  const session = await prisma.betSession.findUnique({
    where: { id: params.sessionId },
    include: { session: { include: { multiplier: true } } }
  });
  if (!session) throw { error: "Session not found." };
  if (session.status !== GameSessionStatus.ACTIVE)
    throw { error: "Session is not accepting bets." };
  const tax = amount.mul(settings.taxPercentage);
  const { bet, transaction, balance } = await prisma.$transaction(
    async (tx) => {
      const available = await tx.userAccount.findFirst({
        where: { userId: params.userId },
        select: { balance: true }
      });
      const balance2 = new Decimal2(available?.balance ?? 0);
      if (balance2.lessThan(amount.add(tax))) {
        throw { error: "Insufficient balance to place this bet." };
      }
      const bet2 = await tx.gameBet.createMany({
        data: combinedOdds.map((targetNumber) => ({
          userId: params.userId,
          sessionId: params.sessionId,
          targetNumber: targetNumber.bettedValue,
          multiplierNumber: new Decimal2(targetNumber.multiplier).toNumber(),
          amount: new Decimal2(params.amount)
        }))
      });
      await tx.userAccount.update({
        where: { userId: params.userId },
        data: { balance: balance2.sub(amount.add(tax)).toNumber() }
      });
      const transaction2 = await tx.transaction.create({
        data: { userId: params.userId, amount, type: "BET", tax }
      });
      await tx.transaction.create({
        data: {
          userId: params.userId,
          amount: tax.negated(),
          type: "TAX",
          tax: 0
        }
      });
      const updatedBalance = balance2.sub(amount.add(tax)).toNumber();
      return { bet: bet2, transaction: transaction2, balance: updatedBalance };
    }
  );
  await emitGameEvent("bet_placed" /* BET_PLACED */, {
    userId: params.userId,
    sessionId: session.id,
    sessionNumber: session.session.sessionNumber,
    targetNumber: params.targetNumbers,
    amount: amount.toNumber(),
    totalBetsInSession: await prisma.gameBet.count({
      where: { sessionId: session.id }
    })
  });
  return { bet, transaction, balance };
};
var placeTicketBet = async (params) => {
  const numbers = params.targetNumbers.filter((n) => !isNaN(Number(n)));
  const letters = params.targetNumbers.filter((n) => isNaN(Number(n)));
  const settings = await prisma.gameFinancialSetting.findFirst({
    orderBy: { createdAt: "desc" }
  });
  if (!settings) throw { error: "Financial settings not configured." };
  const numbersOdds = await prisma.gameTargetNumber.findMany({
    where: { targetNumber: { in: numbers.map((n) => Number(n)) } }
  });
  const lettersOdds = await prisma.gameWinMultiplier.findMany({
    where: { multiplierLetter: { in: letters } }
  });
  const combinedOdds = [
    ...numbersOdds.map((n) => ({
      bettedValue: String(n.targetNumber),
      multiplier: n.multiplierNumber
    })),
    ...lettersOdds.map((l) => ({
      bettedValue: String(l.multiplierLetter),
      multiplier: l.winMultiplier
    }))
  ];
  const amount = new Decimal2(params.amount).mul(combinedOdds.length);
  if (amount.lessThan(settings.minBetAmount))
    throw { error: `Minimum bet amount is ${settings.minBetAmount}.` };
  if (amount.greaterThan(settings.maxBetAmount))
    throw { error: `Maximum bet amount is ${settings.maxBetAmount}.` };
  const session = await prisma.betSession.findUnique({
    where: { id: params.sessionId },
    include: { session: { include: { multiplier: true } } }
  });
  if (!session) throw { error: "Session not found." };
  if (session.status !== GameSessionStatus.ACTIVE)
    throw { error: "Session is not accepting bets." };
  const tax = amount.mul(settings.taxPercentage);
  const { bet, transaction, balance, ticket } = await prisma.$transaction(
    async (tx) => {
      const ticket2 = await tx.ticket.create({
        data: {
          name: params.ticket.name,
          phone: params.ticket.phone,
          userId: params.userId,
          amount: new Decimal2(params.amount)
        }
      });
      const available = await tx.userAccount.findFirst({
        where: { userId: params.userId },
        select: { balance: true }
      });
      const balance2 = new Decimal2(available?.balance ?? 0);
      await tx.gameBet.createMany({
        data: combinedOdds.map((targetNumber) => ({
          ticketId: ticket2.id,
          sessionId: params.sessionId,
          targetNumber: targetNumber.bettedValue,
          multiplierNumber: new Decimal2(targetNumber.multiplier).toNumber(),
          amount: new Decimal2(params.amount)
        }))
      });
      const bet2 = await tx.gameBet.findMany({
        where: { ticketId: ticket2.id }
      });
      await tx.userAccount.update({
        where: { userId: params.userId },
        data: { balance: balance2.add(amount.add(tax)).toNumber() }
      });
      const transaction2 = await tx.transaction.create({
        data: {
          userId: params.userId,
          amount,
          type: "TICKET",
          tax,
          ticketId: ticket2.id
        }
      });
      await tx.transaction.create({
        data: {
          userId: params.userId,
          ticketId: ticket2.id,
          amount: tax.negated(),
          type: "TAX",
          tax: 0
        }
      });
      const updatedBalance = balance2.add(amount.add(tax)).toNumber();
      return { bet: bet2, transaction: transaction2, balance: updatedBalance, ticket: ticket2, session };
    }
  );
  await emitGameEvent("bet_placed" /* BET_PLACED */, {
    userId: params.userId,
    sessionId: session.id,
    sessionNumber: session.session.sessionNumber,
    targetNumber: params.targetNumbers,
    amount: amount.toNumber(),
    totalBetsInSession: await prisma.gameBet.count({
      where: { sessionId: session.id }
    })
  });
  return { bet, transaction, balance, ticket, session };
};
var getUserBets = async (params) => {
  const page = params.page || 1;
  const limit = Number(params.limit) || 10;
  const [data, total] = await prisma.$transaction([
    prisma.gameBet.findMany({
      where: { userId: params.userId },
      include: {
        session: {
          include: {
            session: {
              select: { id: true, sessionNumber: true, status: true }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.gameBet.count({ where: { userId: params.userId } })
  ]);
  return {
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};
var payTicket = async (params) => {
  const ticket = await prisma.ticket.update({
    where: { id: params.ticketId },
    data: {
      paid: true
    }
  });
  return { ticket };
};
var getLatestBetResults = async () => {
  const latestBet = await prisma.gameResult.findMany({
    orderBy: { createdAt: "desc" },
    take: 15
  });
  return latestBet;
};

// routes/bet.routes.ts
import path3 from "path";
import express from "express";

// utils/generateSlip.ts
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path2 from "path";
var W = 226.77;
var MM = 2.8346;
var MARGIN = 14;
function fmt(n) {
  return `RWF ${n.toLocaleString("en-RW", { minimumFractionDigits: 0 })}`;
}
async function generateBetSlip(data, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `slip_${data.ticketRef}.pdf`;
  const outputPath = path2.join(outputDir, filename);
  const totalStake = data.bets.reduce((s, b) => s + b.stake, 0);
  const totalPayout = data.bets.reduce((s, b) => s + b.stake * b.odds, 0);
  const taxAmount = totalStake * data.taxPct;
  const netPaid = totalStake + taxAmount;
  const potProfit = totalPayout - netPaid;
  const qrContent = data.qrUrl || `TICKET:${data.ticketRef}`;
  const qrBuffer = await QRCode.toBuffer(qrContent, {
    type: "png",
    width: 120,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" }
  });
  const estimatedHeight = 340 + data.bets.length * 11 + 80;
  const doc = new PDFDocument({
    size: [W, estimatedHeight],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: true,
    bufferPages: true
  });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);
  let y = 10;
  const company = data.company ?? "WinWheel";
  const location = data.location ?? "Kigali";
  const cx = (text, size, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(text, 0, y, { width: W, align: "center" });
    y += size + 2;
  };
  const lrRow = (left, right, size = 8, boldRight = false) => {
    doc.font("Helvetica").fontSize(size).text(left, MARGIN, y, { continued: false });
    doc.font(boldRight ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(right, 0, y, { width: W - MARGIN, align: "right" });
    y += size + 3;
  };
  const dashes = () => {
    doc.save().dash(2, { space: 3 }).moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor("#aaaaaa").lineWidth(0.5).stroke().restore();
    y += 5;
  };
  const rule = () => {
    doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor("#333333").lineWidth(0.4).stroke();
    y += 4;
  };
  y += 4;
  cx(company, 16, true);
  cx(location, 8);
  y += 2;
  doc.font("Helvetica").fontSize(7.5);
  doc.text(`SESSION ${data.sessionNumber}`, MARGIN, y);
  doc.text(`${data.date}  ${data.time}`, 0, y, { width: W - MARGIN, align: "right" });
  y += 11;
  dashes();
  cx("TICKET HOLDER", 7, true);
  y += 1;
  doc.font("Helvetica-Bold").fontSize(8.5).text(data.holderName, MARGIN, y);
  if (data.holderPhone) {
    doc.font("Helvetica").fontSize(7.5).text(data.holderPhone, 0, y, { width: W - MARGIN, align: "right" });
  }
  y += 12;
  dashes();
  doc.font("Helvetica-Bold").fontSize(7.5).text("Selections", MARGIN, y);
  y += 10;
  const C = {
    idx: MARGIN,
    type: MARGIN + 12,
    pick: MARGIN + 42,
    stake: MARGIN + 62,
    odds: MARGIN + 92,
    pay: W - MARGIN
  };
  doc.font("Helvetica-Bold").fontSize(7);
  doc.text("#", C.idx, y);
  doc.text("Type", C.type, y);
  doc.text("Pick", C.pick, y);
  doc.text("Stake", C.stake, y);
  doc.text("Odds", C.odds, y);
  doc.text("Payout", 0, y, { width: W - MARGIN, align: "right" });
  y += 9;
  rule();
  data.bets.forEach((bet, i) => {
    const payout = bet.stake * bet.odds;
    doc.font("Helvetica").fontSize(7.5);
    doc.text(String(i + 1), C.idx, y);
    doc.text(bet.type, C.type, y);
    doc.font("Helvetica-Bold").fontSize(7.5);
    doc.text(bet.selection, C.pick, y);
    doc.font("Helvetica").fontSize(7.5);
    doc.text(bet.stake.toLocaleString(), C.stake, y);
    doc.text(`${bet.odds}x`, C.odds, y);
    doc.font("Helvetica-Bold").fontSize(7.5);
    doc.text(payout.toLocaleString(), 0, y, { width: W - MARGIN, align: "right" });
    y += 11;
  });
  y += 2;
  dashes();
  cx("SUMMARY", 7, true);
  y += 2;
  lrRow("Stake", fmt(totalStake), 7.5);
  lrRow(`Tax (${data.taxPct * 100}%)`, fmt(taxAmount), 7.5);
  y += 1;
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("TOTAL PAID", MARGIN, y);
  doc.text(fmt(netPaid), 0, y, { width: W - MARGIN, align: "right" });
  y += 13;
  dashes();
  lrRow("Expected Return", fmt(totalPayout), 8, true);
  y += 1;
  const profitColor = potProfit >= 0 ? "#16a34a" : "#dc2626";
  const profitSign = potProfit >= 0 ? "+" : "";
  doc.font("Helvetica-Bold").fontSize(9);
  doc.fillColor(profitColor).text("Potential Profit", MARGIN, y);
  doc.text(`${profitSign}${fmt(potProfit)}`, 0, y, { width: W - MARGIN, align: "right" });
  doc.fillColor("black");
  y += 14;
  dashes();
  const qrSize = 28 * MM;
  const qrX = (W - qrSize) / 2;
  doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
  y += qrSize + 4;
  doc.font("Helvetica").fontSize(6.5).text(data.ticketRef, 0, y, { width: W, align: "center" });
  y += 10;
  dashes();
  const footer = "Thanks for playing!\nPlease check your ticket.";
  footer.split("\n").forEach((line) => {
    doc.font("Helvetica").fontSize(7.5).text(line, 0, y, { width: W, align: "center" });
    y += 10;
  });
  y += 6;
  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  return outputPath;
}

// routes/bet.routes.ts
var SLIPS_DIR = path3.join(process.cwd(), "public", "slips");
var PUBLIC_BASE = process.env.PUBLIC_URL ?? "http://localhost:3000";
var router7 = Router7();
router7.use("/slips", express.static(SLIPS_DIR));
router7.get("/verify/:ticketId", async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId },
      select: {
        id: true,
        name: true,
        phone: true,
        amount: true,
        paid: true,
        won: true,
        createdAt: true,
        gameBets: {
          select: {
            targetNumber: true,
            multiplierNumber: true,
            amount: true,
            session: {
              select: {
                session: {
                  select: { sessionNumber: true }
                }
              }
            }
          }
        }
      }
    });
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found." });
    }
    return res.json({
      id: ticket.id,
      name: ticket.name,
      phone: ticket.phone,
      amount: ticket.amount,
      paid: ticket.paid,
      won: ticket.won,
      createdAt: ticket.createdAt,
      sessionNumber: ticket.gameBets[0]?.session?.session?.sessionNumber ?? null,
      bets: ticket.gameBets.map((b) => ({
        targetNumber: b.targetNumber,
        multiplierNumber: b.multiplierNumber,
        amount: b.amount
      }))
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to verify ticket." });
  }
});
router7.post("/bets", authenticate, async (req, res) => {
  try {
    const { sessionId, targetNumbers, amount } = req.body;
    if (!sessionId || targetNumbers == null || !amount) {
      return res.status(400).json({ error: "sessionId, targetNumber, and amount are required." });
    }
    const result = await placeBet({
      userId: req.user.id,
      sessionId,
      targetNumbers,
      amount
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json(error);
  }
});
router7.post("/bets/ticket", authenticate, async (req, res) => {
  try {
    const { sessionId, targetNumbers, amount, ticket } = req.body;
    if (!sessionId || targetNumbers == null || !amount) {
      return res.status(400).json({ error: "sessionId, targetNumber, and amount are required." });
    }
    const result = await placeTicketBet({
      userId: req.user.id,
      sessionId,
      targetNumbers,
      amount,
      ticket
    });
    const slipData = {
      ticketRef: result.ticket.id,
      sessionNumber: result.session.session.sessionNumber,
      date: (/* @__PURE__ */ new Date()).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }),
      time: (/* @__PURE__ */ new Date()).toLocaleTimeString("en-GB"),
      holderName: ticket.name,
      holderPhone: ticket.phone,
      bets: targetNumbers.map((sel) => ({
        type: isNaN(Number(sel)) ? "Letter" : "Number",
        selection: sel,
        stake: amount,
        odds: result.bet.find((b) => b.targetNumber === sel)?.multiplierNumber ?? 1
      })),
      taxPct: 0.15,
      company: "WinWheel",
      location: "Kigali",
      qrUrl: `${PUBLIC_BASE}/verify/${result.ticket.id}`
    };
    const pdfPath = await generateBetSlip(slipData, SLIPS_DIR);
    const pdfFile = path3.basename(pdfPath);
    const slipUrl = `${PUBLIC_BASE}/slips/${pdfFile}`;
    return res.json({ ...result, slipUrl });
  } catch (error) {
    res.status(400).json(error);
  }
});
router7.patch("/bets/ticket/pay/:id", authenticate, async (req, res) => {
  try {
    const result = await payTicket({ ticketId: req.params.id });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json(error);
  }
});
router7.get("/bets/me", authenticate, async (req, res) => {
  try {
    res.json(await getUserBets({ userId: req.user.id, ...req.query }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch bets." });
  }
});
router7.get("/bets/latest", authenticate, async (req, res) => {
  try {
    const latestBet = await getLatestBetResults();
    res.json(latestBet);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch latest bet result." });
  }
});
var bet_routes_default = router7;

// routes/gameResult.routes.ts
import { Router as Router8 } from "express";

// controllers/gameResult.controller.ts
var recordResult = async (params) => {
  const session = await prisma.betSession.findUnique({
    where: { id: params.sessionId },
    include: { gameBets: true, session: { include: { multiplier: true } } }
  });
  if (!session) throw { error: "Session not found." };
  if (session.status === GameSessionStatus.COMPLETED)
    throw { error: "Session already completed." };
  const result = await prisma.$transaction(async (tx) => {
    const gameResult = await tx.gameResult.create({
      data: {
        sessionId: params.sessionId,
        winNumber: params.winNumber,
        winMultiplier: params.winMultiplier
      }
    });
    for (const bet of session.gameBets) {
      if (bet.targetNumber === String(params.winNumber)) {
        const payout = bet.amount.mul(bet.multiplierNumber ?? 1);
        await tx.userAccount.update({
          where: { userId: bet.userId },
          data: { balance: { increment: payout } }
        });
        await tx.transaction.create({
          data: {
            userId: bet.userId,
            amount: payout,
            type: "WIN_PAYOUT",
            tax: 0
          }
        });
      }
    }
    await tx.gameSession.update({
      where: { id: session.sessionId },
      data: { status: GameSessionStatus.COMPLETED }
    });
    return gameResult;
  });
  return result;
};
var getResults = async (params) => {
  const page = params.page || 1;
  const limit = params.limit || 10;
  const where = {
    ...params.sessionId && { sessionId: params.sessionId }
  };
  const [data, total] = await prisma.$transaction([
    prisma.gameResult.findMany({
      where,
      include: {
        session: { include: { session: { select: { sessionNumber: true } } } }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.gameResult.count({ where })
  ]);
  return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

// routes/gameResult.routes.ts
var router8 = Router8();
router8.post("/results", authenticate, async (req, res) => {
  try {
    const { sessionId, winNumber, winMultiplier } = req.body;
    if (!sessionId || winNumber == null || winMultiplier == null) {
      return res.status(400).json({ error: "sessionId, winNumber, and winMultiplier are required." });
    }
    res.status(201).json(await recordResult({ sessionId, winNumber, winMultiplier }));
  } catch (error) {
    res.status(400).json(error);
  }
});
router8.get("/results", authenticate, async (req, res) => {
  try {
    res.json(await getResults(req.query));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch results." });
  }
});
var gameResult_routes_default = router8;

// routes/spin.routes.ts
import { Router as Router9 } from "express";

// services/spinAnimation.ts
var calculateSpinAnimation = async (winNumber) => {
  const numbers = await prisma.gameTargetNumber.findMany({
    orderBy: { targetNumber: "asc" }
  });
  const totalSlots = numbers.length;
  const slotAngle = 360 / totalSlots;
  const winIndex = numbers.findIndex((n) => n.targetNumber === winNumber);
  const finalAngle = winIndex * slotAngle + slotAngle / 2;
  const fullRotations = 5 + Math.floor(Math.random() * 3);
  const totalRotation = fullRotations * 360 + finalAngle;
  const duration = 5e3;
  const easing = { x1: 0.25, y1: 0.1, x2: 0, y2: 1 };
  return {
    startAngle: 0,
    totalRotation,
    finalAngle,
    duration,
    easing,
    winIndex,
    totalSlots,
    slotAngle
  };
};

// controllers/spin.controller.ts
import { randomInt } from "crypto";
var secureRandInt = (min, max) => {
  if (min >= max)
    throw new RangeError(`secureRandInt: min (${min}) must be < max (${max})`);
  return randomInt(min, max);
};
var securePickRandom = (arr) => {
  if (!arr.length) throw new Error("securePickRandom: array must not be empty");
  return arr[secureRandInt(0, arr.length)];
};
var startBetSession = async (params) => {
  try {
    const session = await prisma.betSession.create({
      data: { sessionId: params.sessionId },
      include: { session: { include: { multiplier: true } } }
    });
    return session;
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while creating the bet session." };
  }
};
var endBetSession = async (params) => {
  try {
    const session = await prisma.betSession.update({
      where: { id: params.sessionId },
      data: {
        status: GameSessionStatus.COMPLETED,
        endTime: /* @__PURE__ */ new Date(),
        resultId: params.resultId
      }
    });
    return session;
  } catch (error) {
    console.error(error);
    throw { error: "An error occurred while ending the bet session." };
  }
};
var getNextSession = async () => {
  const { active, nextPreview } = await prisma.$transaction(async (tx) => {
    await tx.betSession.updateMany({
      where: { status: GameSessionStatus.ACTIVE },
      data: { status: GameSessionStatus.CANCELLED, endTime: /* @__PURE__ */ new Date() }
    });
    const currentActive = await tx.gameSession.findFirst({
      where: { status: GameSessionStatus.ACTIVE },
      include: { multiplier: true }
    });
    if (currentActive) {
      await tx.gameSession.update({
        where: { id: currentActive.id },
        data: { status: GameSessionStatus.COMPLETED }
      });
    }
    let next = await tx.gameSession.findFirst({
      where: {
        status: GameSessionStatus.UPCOMING,
        ...currentActive && { id: { not: currentActive.id } }
      },
      orderBy: { sessionNumber: "asc" },
      include: { multiplier: true }
    });
    if (!next) {
      await tx.gameSession.updateMany({
        where: {
          status: GameSessionStatus.COMPLETED,
          ...currentActive && { id: { not: currentActive.id } }
        },
        data: { status: GameSessionStatus.UPCOMING }
      });
      next = await tx.gameSession.findFirst({
        where: {
          status: GameSessionStatus.UPCOMING,
          ...currentActive && { id: { not: currentActive.id } }
        },
        orderBy: { sessionNumber: "asc" },
        include: { multiplier: true }
      });
    }
    if (!next) {
      throw { error: "No sessions available. Please seed the database." };
    }
    const activeSession = await tx.gameSession.update({
      where: { id: next.id },
      data: { status: GameSessionStatus.ACTIVE },
      include: { multiplier: true }
    });
    const nextPreviewSession = await tx.gameSession.findFirst({
      where: {
        status: GameSessionStatus.UPCOMING,
        id: { not: activeSession.id }
      },
      orderBy: { sessionNumber: "asc" },
      include: { multiplier: true }
    });
    return { active: activeSession, nextPreview: nextPreviewSession };
  });
  await emitGameEvent("session_opened" /* SESSION_OPENED */, {
    currentSession: {
      id: active.id,
      sessionNumber: active.sessionNumber,
      duration: active.duration,
      multiplier: active.multiplier
    },
    nextSession: nextPreview ? {
      id: nextPreview.id,
      sessionNumber: nextPreview.sessionNumber,
      duration: nextPreview.duration,
      multiplier: nextPreview.multiplier
    } : null
  });
  return { ...active, nextSessionPreview: nextPreview ?? null };
};
var spin = async () => {
  const activeBetSession = await prisma.betSession.findFirst({
    where: { status: GameSessionStatus.ACTIVE },
    include: {
      session: { include: { multiplier: true } },
      gameBets: true
    }
  });
  if (!activeBetSession) {
    throw { error: "No active bet session. Call getNextSession first." };
  }
  const activeGameSession = activeBetSession.session;
  const winMultiplier = activeGameSession.multiplier.winMultiplier;
  const allTargetNumbers = await prisma.gameTargetNumber.findMany({
    select: { targetNumber: true },
    orderBy: { targetNumber: "asc" }
  });
  const allMultipliers = await prisma.gameWinMultiplier.findMany({
    orderBy: { winMultiplier: "asc" }
  });
  const filteredMultiplier = allMultipliers.filter(
    (m) => m.winMultiplier <= winMultiplier
  );
  if (!allTargetNumbers.length) {
    throw { error: "No target numbers configured." };
  }
  const allNumbers = allTargetNumbers.map((n) => n.targetNumber);
  const decidedWinNumber = securePickRandom(allNumbers);
  const decidedWinMultiplier = securePickRandom(filteredMultiplier);
  const result = await prisma.$transaction(async (tx) => {
    const gameResult = await tx.gameResult.create({
      data: {
        sessionId: activeBetSession.id,
        winNumber: decidedWinNumber,
        winMultiplier: decidedWinMultiplier.multiplierLetter
      }
    });
    for (const bet of activeBetSession.gameBets) {
      const isNumberBet = !isNaN(Number(bet.targetNumber));
      if (isNumberBet) {
        const bettedNumber = Number(bet.targetNumber);
        if (bettedNumber === decidedWinNumber) {
          const odd = await tx.gameTargetNumber.findFirst({
            where: { targetNumber: bettedNumber }
          });
          if (!odd) continue;
          const payout = bet.amount.mul(odd.multiplierNumber);
          if (bet.userId) {
            await tx.userAccount.update({
              where: { userId: bet.userId },
              data: { balance: { increment: payout } }
            });
          } else if (bet.ticketId) {
            await tx.ticket.update({
              where: { id: bet.ticketId },
              data: { won: true }
            });
          }
          await tx.transaction.create({
            data: {
              userId: bet.userId,
              amount: payout,
              type: "WIN_PAYOUT",
              tax: 0
            }
          });
        }
      } else {
        if (bet.targetNumber === decidedWinMultiplier.multiplierLetter) {
          const odd = await tx.gameWinMultiplier.findFirst({
            where: { multiplierLetter: bet.targetNumber }
          });
          if (!odd) continue;
          const payout = bet.amount.mul(odd.winMultiplier);
          if (bet.userId) {
            await tx.userAccount.update({
              where: { userId: bet.userId },
              data: { balance: { increment: payout } }
            });
          } else if (bet.ticketId) {
            await tx.ticket.update({
              where: { id: bet.ticketId },
              data: { won: true }
            });
          }
          await tx.transaction.create({
            data: {
              userId: bet.userId,
              amount: payout,
              type: "WIN_PAYOUT",
              tax: 0
            }
          });
        }
      }
    }
    await tx.betSession.update({
      where: { id: activeBetSession.id },
      data: {
        status: GameSessionStatus.COMPLETED,
        endTime: /* @__PURE__ */ new Date(),
        resultId: gameResult.id
      }
    });
    await tx.gameSession.update({
      where: { id: activeGameSession.id },
      data: { status: GameSessionStatus.COMPLETED }
    });
    return gameResult;
  });
  const upcomingCount = await prisma.gameSession.count({
    where: { status: GameSessionStatus.UPCOMING }
  });
  if (upcomingCount === 0) {
    await prisma.gameSession.updateMany({
      where: {
        status: GameSessionStatus.COMPLETED,
        id: { not: activeGameSession.id }
      },
      data: { status: GameSessionStatus.UPCOMING }
    });
  }
  const nextSession = await prisma.gameSession.findFirst({
    where: { status: GameSessionStatus.UPCOMING },
    orderBy: { sessionNumber: "asc" },
    include: { multiplier: true }
  });
  const animation = await calculateSpinAnimation(decidedWinNumber);
  const payload = {
    completedSession: {
      id: activeBetSession.id,
      sessionNumber: activeGameSession.sessionNumber
    },
    winNumber: decidedWinNumber,
    winMultiplier: decidedWinMultiplier.multiplierLetter,
    animation,
    result,
    nextSession: nextSession ? {
      id: nextSession.id,
      sessionNumber: nextSession.sessionNumber,
      multiplier: nextSession.multiplier
    } : null
  };
  await emitGameEvent("spin_result" /* SPIN_RESULT */, payload);
  return payload;
};

// routes/spin.routes.ts
var router9 = Router9();
router9.get("/spin/next", authenticate, async (req, res) => {
  try {
    res.json(await getNextSession());
  } catch (error) {
    res.status(404).json(error);
  }
});
router9.post("/spin", authenticate, async (req, res) => {
  try {
    const { winNumber } = req.body;
    if (winNumber != null && typeof winNumber !== "number") {
      return res.status(400).json({ error: "winNumber must be a number when provided." });
    }
    res.json(await spin({ winNumber }));
  } catch (error) {
    res.status(400).json(error);
  }
});
var spin_routes_default = router9;

// routes/dashboard.routes.ts
import { Router as Router10 } from "express";

// controllers/dashboard.controller.ts
var getAdminDashboard = async () => {
  const [
    totalUsers,
    totalSessions,
    activeSessions,
    upcomingSessions,
    totalBets,
    revenueAgg,
    payoutAgg,
    recentTransactions,
    recentBets
  ] = await prisma.$transaction([
    prisma.user.count(),
    prisma.gameSession.count(),
    prisma.gameSession.count({ where: { status: GameSessionStatus.ACTIVE } }),
    prisma.gameSession.count({ where: { status: GameSessionStatus.UPCOMING } }),
    prisma.gameBet.count(),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: "BET" }
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: "WIN_PAYOUT" }
    }),
    prisma.transaction.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true } } }
    }),
    prisma.gameBet.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true } },
        session: { include: { session: { select: { sessionNumber: true } } } }
      }
    })
  ]);
  const totalRevenue = revenueAgg._sum.amount ?? 0;
  const totalPayouts = payoutAgg._sum.amount ?? 0;
  return {
    stats: {
      totalUsers,
      totalSessions,
      activeSessions,
      upcomingSessions,
      totalBets,
      totalRevenue,
      totalPayouts,
      netProfit: Number(totalRevenue) - Number(totalPayouts)
    },
    recentTransactions,
    recentBets
  };
};

// routes/dashboard.routes.ts
var router10 = Router10();
router10.get("/dashboard", authenticate, async (req, res) => {
  try {
    res.json(await getAdminDashboard());
  } catch (error) {
    res.status(500).json({ error: "Failed to load dashboard." });
  }
});
var dashboard_routes_default = router10;

// services/gameLoop.ts
var BETTING_DURATION_MS = 6e4;
var COUNTDOWN_TICK_MS = 1e3;
var ANIMATION_DURATION_MS = 5e3;
var RESULTS_DISPLAY_MS = 3e3;
var LOCK_BUFFER_MS = 500;
var isLoopRunning = false;
var delay = (ms) => new Promise((res) => setTimeout(res, ms));
var runCountdown = async (totalMs) => {
  let remaining = Math.floor(totalMs / 1e3);
  while (remaining > 0 && isLoopRunning) {
    await emitGameEvent("betting_countdown" /* BETTING_COUNTDOWN */, {
      secondsLeft: remaining,
      totalSeconds: Math.floor(totalMs / 1e3)
    });
    await delay(COUNTDOWN_TICK_MS);
    remaining--;
  }
  if (!isLoopRunning) return;
  await emitGameEvent("betting_countdown" /* BETTING_COUNTDOWN */, {
    secondsLeft: 0,
    totalSeconds: Math.floor(totalMs / 1e3)
  });
};
var startGameLoop = async () => {
  if (isLoopRunning) {
    console.log("[GameLoop] Already running, skipping duplicate start.");
    return;
  }
  isLoopRunning = true;
  console.log("[GameLoop] Started.");
  while (isLoopRunning) {
    try {
      const session = await getNextSession();
      if (!isLoopRunning) break;
      const betSession = await startBetSession({ sessionId: session.id });
      console.log(
        `[GameLoop] Session #${betSession.session.sessionNumber} opened.`
      );
      await emitGameEvent("session_opened" /* SESSION_OPENED */, {
        sessionId: betSession.id,
        sessionNumber: betSession.session.sessionNumber,
        bettingWindowMs: BETTING_DURATION_MS,
        multiplier: betSession.session.multiplier ?? null,
        shouldWin: betSession.session.shouldWin ?? false,
        duration: ANIMATION_DURATION_MS / 1e3
      });
      if (!isLoopRunning) break;
      await runCountdown(BETTING_DURATION_MS);
      if (!isLoopRunning) break;
      await emitGameEvent("bets_locked" /* BETS_LOCKED */, {
        sessionId: betSession.id,
        sessionNumber: betSession.session.sessionNumber
      });
      if (!isLoopRunning) break;
      console.log(
        `[GameLoop] Bets locked for session #${betSession.session.sessionNumber}.`
      );
      await delay(LOCK_BUFFER_MS);
      if (!isLoopRunning) break;
      const result = await spin();
      if (!isLoopRunning) break;
      console.log(
        `[GameLoop] Session #${betSession.session.sessionNumber} result - win number: ${result.winNumber}`
      );
      await emitGameEvent("spin_result" /* SPIN_RESULT */, {
        sessionId: betSession.id,
        sessionNumber: betSession.session.sessionNumber,
        winNumber: result.winNumber,
        winMultiplier: result.winMultiplier,
        animation: result.animation ?? {
          duration: ANIMATION_DURATION_MS / 1e3
        },
        completedSession: result.completedSession,
        nextSession: result.nextSession ?? null
      });
      if (!isLoopRunning) break;
      await delay(ANIMATION_DURATION_MS);
      if (!isLoopRunning) break;
      await endBetSession({
        sessionId: betSession.id,
        resultId: result.result.id
      });
      await emitGameEvent("round_ended" /* ROUND_ENDED */, {
        completedSession: result.completedSession,
        winNumber: result.winNumber,
        nextSession: result.nextSession ?? null
      });
      if (!isLoopRunning) break;
      console.log(
        `[GameLoop] Round ended. Showing results for ${RESULTS_DISPLAY_MS}ms.`
      );
      await delay(RESULTS_DISPLAY_MS);
    } catch (err) {
      console.error("[GameLoop] Error - retrying in 5s:", err);
      if (!isLoopRunning) break;
      await delay(5e3);
    }
  }
  console.log("[GameLoop] Stopped.");
};
var stopGameLoop = () => {
  if (!isLoopRunning) return;
  isLoopRunning = false;
  console.log("[GameLoop] Stop requested - will halt after current step.");
};

// index.ts
morgan.token("time", () => (/* @__PURE__ */ new Date()).toISOString());
var app = express2();
var corsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS", "PUT"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        frameAncestors: ["'self'", process.env.FRONTEND_URL ?? "http://localhost:5173"]
      }
    }
  })
);
app.use(morgan(":time :method :url :status :response-time ms - :res[content-length]"));
app.use(express2.json({ limit: "10mb" }));
app.use(express2.urlencoded({ extended: true }));
app.use(cookieParser());
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", env: process.env.NODE_ENV });
});
app.use("/auth", user_routes_default);
app.use(session_routes_default);
app.use(targetNumber_routes_default);
app.use(multipliers_routes_default);
app.use(transaction_routes_default);
app.use(financialSettings_routes_default);
app.use(bet_routes_default);
app.use(gameResult_routes_default);
app.use(spin_routes_default);
app.use(dashboard_routes_default);
app.use((_req, res) => res.status(404).json({ error: "Route not found." }));
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({
    error: process.env.NODE_ENV === "production" ? "An unexpected error occurred." : err.message
  });
});
var server = createServer(app);
var wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", handleConnection);
wss.on("error", (err) => console.error("[WSS] Server error:", err));
var activeSockets = /* @__PURE__ */ new Set();
server.on("connection", (socket) => {
  activeSockets.add(socket);
  socket.on("close", () => activeSockets.delete(socket));
});
var PORT = process.env.PORT ?? 3e3;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  startGameLoop().catch((err) => {
    console.error("[GameLoop] Fatal error, game loop crashed:", err);
    process.exit(1);
  });
});
var shutdown = (signal) => {
  console.log(`[Server] ${signal} received - shutting down gracefully.`);
  stopGameLoop();
  wss.clients.forEach((client) => client.terminate());
  wss.close(() => console.log("[WSS] WebSocket server closed."));
  activeSockets.forEach((socket) => socket.destroy());
  activeSockets.clear();
  server.close(() => {
    console.log("[Server] HTTP server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("[Server] Forced exit after timeout.");
    process.exit(1);
  }, 5e3).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
//# sourceMappingURL=index.js.map