import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import analyzeRouter from "./routes/analyze.js";
import authRoutes from "./routes/auth.js";
import { authenticate } from "./middleware/auth.js";
import { config } from "./config.js";
import { logger } from "./services/logger.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const pool = await getDb();

// Auto-seed default users on startup (fresh DB)
const seedUsers = async () => {
  const existing = await pool.query("SELECT COUNT(*)::int as cnt FROM users");
  const count = existing.rows[0].cnt;
  if (count > 0) return;

  const generatePassword = () => crypto.randomBytes(4).toString("hex") + "!";
  const adminPass = generatePassword();
  const userPass = generatePassword();

  const adminHash = await bcrypt.hash(adminPass, 10);
  const userHash = await bcrypt.hash(userPass, 10);

  await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, $2)", ["admin", adminHash]);
  await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, $2)", ["user1", userHash]);

  logger.info(`=== Seed users created (fresh DB) ===`);
  logger.info(`  admin / ${adminPass}`);
  logger.info(`  user1 / ${userPass}`);
  logger.info(`  === SAVE THESE PASSWORDS ===`);
};
await seedUsers();

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", authRoutes);
app.use("/api", authenticate, analyzeRouter);

// Serve built frontend in production
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api"))
    res.sendFile(path.join(distPath, "index.html"));
});

app.use((err, req, res, next) => {
  logger.error({ err, method: req.method, path: req.path }, "Unhandled error");
  if (err && err.message && (err.message.includes("timeout") || err.message === "timeout")) {
    return res.status(504).json({ error: "Request timeout. Coba lagi." });
  }
  res.status(500).json({ error: "Terjadi kesalahan internal server." });
});

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    logger.info({ port: config.port }, "Server started");
  });
}

export default app;
