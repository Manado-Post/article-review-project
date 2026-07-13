import express from "express";
import cors from "cors";
import helmet from "helmet";
import analyzeRouter from "./routes/analyze.js";
import authRoutes from "./routes/auth.js";
import { authenticate } from "./middleware/auth.js";
import { config } from "./config.js";
import { logger } from "./services/logger.js";

const app = express();

// Security headers
app.use(helmet());

// CORS: restrict to same origin or configured frontend URL
app.use(cors({
  origin: process.env.FRONTEND_URL || true, // true = same origin
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "500kb" }));
app.timeout = 120_000; // 2-minute global request timeout

// Ensure DB is initialized before handling requests
import { getDb } from "./db/init.js";
getDb().catch((err) => {
  logger.error({ err }, "Failed to initialize database");
  process.exit(1);
});

// Wait for DB init before accepting connections
await getDb();

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", authRoutes);
app.use("/api", authenticate, analyzeRouter);

app.use((err, req, res, next) => {
  logger.error({ err, method: req.method, path: req.path }, "Unhandled error");
  if (err && err.message && (err.message.includes("timeout") || err.message === "timeout")) {
    return res.status(504).json({ error: "Request timeout. Coba lagi." });
  }
  res.status(500).json({ error: "Terjadi kesalahan internal server." });
});

app.listen(config.port, () => {
  logger.info({ port: config.port }, "Server started");
});
