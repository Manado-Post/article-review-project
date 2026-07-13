import { Pool } from "@neondatabase/serverless";
import { logger } from "../services/logger.js";

let pool;

export const getDb = async () => {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required for PostgreSQL.");
  }
  pool = new Pool({ connectionString });
  await initSchema();
  logger.info("Database initialized (Neon PostgreSQL)");
  return pool;
};

const initSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
};

export const closeDb = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};
