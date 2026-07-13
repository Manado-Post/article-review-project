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
  // Check if old schema exists (has email column)
  const tableInfo = db.exec("PRAGMA table_info(users)");
  const columns = tableInfo.length > 0 ? tableInfo[0].values.map(c => c[1]) : [];

  if (columns.includes("email")) {
    // Migrate from old schema (email, company) to new (username)
    db.run(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.run("INSERT INTO users_new (id, username, password_hash, created_at) SELECT id, COALESCE(NULLIF(email, ''), 'user'), password_hash, created_at FROM users");
    db.run("DROP TABLE users");
    db.run("ALTER TABLE users_new RENAME TO users");
  } else {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }
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
