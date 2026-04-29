import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { handleConnection } from "./ws/handlers";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { authLimiter, globalLimiter } from "./config/rateLimit";
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

morgan.token("time", () => new Date().toISOString());

const app = express();

const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS",  "PUT"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

// ── 1. CORS first — handles OPTIONS preflight automatically ──
app.use(cors(corsOptions));

// ── 2. Helmet after CORS so it doesn't overwrite CORS headers ─
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// ── 3. Logging ────────────────────────────────────────────────
app.use(
  morgan(":time :method :url :status :response-time ms - :res[content-length]"),
);

// ── 4. Body parsers ───────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── 5. Cookie parser ──────────────────────────────────────────
app.use(cookieParser());

// ── 6. Rate limiters — after OPTIONS are already handled ──────
//    (rate limiters should never block preflight requests)
// app.use(globalLimiter);
// app.use("/auth/login", authLimiter);
// app.use("/auth", authLimiter);

// ── 7. Routes ─────────────────────────────────────────────────
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
// ── 8. 404 ────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// ── 9. Global error handler ───────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err.stack);
    res.status(500).json({
      error:
        process.env.NODE_ENV === "production"
          ? "An unexpected error occurred."
          : err.message,
    });
  },
);

const server = createServer(app);

// const wss = new WebSocketServer({ server, path: "/ws" });
// wss.on("connection", handleConnection);
// wss.on("error", (err) => console.error("[WSS] Server error:", err));

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});
