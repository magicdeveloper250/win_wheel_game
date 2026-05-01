import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { handleConnection } from "./ws/handlers";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import userRoutes from "./routes/user.routes";
import sessionRoutes from "./routes/session.routes";
import targetNumberRoutes from "./routes/targetNumber.routes";
import multipliersRoutes from "./routes/multipliers.routes";
import transactionRoutes from "./routes/transaction.routes";
import financialSettingsRoutes from "./routes/financialSettings.routes";
import betRoutes from "./routes/bet.routes";
import gameResultRoutes from "./routes/gameResult.routes";
import spinRoutes from "./routes/spin.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import { startGameLoop, stopGameLoop } from "./services/gameLoop";
import { Socket } from "net";

morgan.token("time", () => new Date().toISOString());

const app = express();

const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS", "PUT"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(morgan(":time :method :url :status :response-time ms - :res[content-length]"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", env: process.env.NODE_ENV });
});

app.use("/auth", userRoutes);
app.use(sessionRoutes);
app.use(targetNumberRoutes);
app.use(multipliersRoutes);
app.use(transactionRoutes);
app.use(financialSettingsRoutes);
app.use(betRoutes);
app.use(gameResultRoutes);
app.use(spinRoutes);
app.use(dashboardRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found." }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    error: process.env.NODE_ENV === "production" ? "An unexpected error occurred." : err.message,
  });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", handleConnection);
wss.on("error", (err) => console.error("[WSS] Server error:", err));

const activeSockets = new Set<Socket>();
server.on("connection", (socket) => {
  activeSockets.add(socket);
  socket.on("close", () => activeSockets.delete(socket));
});

const PORT = process.env.PORT ?? 3000;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  startGameLoop().catch((err) => {
    console.error("[GameLoop] Fatal error, game loop crashed:", err);
    process.exit(1);
  });
});

const shutdown = (signal: "SIGINT" | "SIGTERM") => {
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
  }, 5000).unref();  
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));