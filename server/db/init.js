import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../services/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "app.db");
const WASM_PATH = path.join(DATA_DIR, "sql-wasm.wasm");

let db;
let initPromise;

export const getDb = async () => {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

      // Configure WASM: prefer local file (for production/Render) over CDN
      const SQL = await initSqlJs({
        locateFile: () => WASM_PATH,
      });

      if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
      } else {
        db = new SQL.Database();
      }

      initSchema();
      saveDb();
      logger.info({ path: DB_PATH }, "Database initialized (sql.js)");
      return db;
    })();
  }
  return initPromise;
};

const initSchema = () => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      company TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
};

export const saveDb = () => {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    logger.error({ err: e }, "Failed to persist DB");
  }
};

export const closeDb = () => {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
};
