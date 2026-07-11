import express from "express";
import cors from "cors";
import analyzeRouter from "./routes/analyze.js";
import { config } from "./config.js";
import { logger } from "./services/logger.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "500kb" })); // prevent OOM from large payloads

// Global error handler — catch any uncaught exception
app.use((err, req, res, next) => {
  logger.error({ err, method: req.method, path: req.path }, "Unhandled error");
  if (err && err.message && (err.message.includes("timeout") || err.message === "timeout")) {
    return res.status(504).json({ error: "Request timeout. Coba lagi." });
  }
  res.status(500).json({ error: "Terjadi kesalahan internal server." });
});

app.use("/api", analyzeRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(config.port, () => {
  logger.info({ port: config.port }, "Server started");
});
