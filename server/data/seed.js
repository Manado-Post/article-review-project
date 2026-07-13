import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "app.db");
const WASM_PATH = path.join(DATA_DIR, "sql-wasm.wasm");

const run = async () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const SQL = await initSqlJs({ locateFile: () => WASM_PATH });
  let db;
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  }

  const existing = db.exec("SELECT COUNT(*) as cnt FROM users");
  const count = existing[0]?.values[0]?.[0] || 0;
  if (count > 0) {
    console.log(`Users already exist (${count} found). Skipping seed.`);
  } else {
    const genPass = () => crypto.randomBytes(4).toString("hex") + "!";
    const adminPass = genPass();
    const userPass = genPass();

    const adminHash = await bcrypt.hash(adminPass, 10);
    const userHash = await bcrypt.hash(userPass, 10);

    db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", ["admin", adminHash]);
    db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", ["user1", userHash]);

    console.log("=== Seed users created ===");
    console.log(`  admin / ${adminPass}`);
    console.log(`  user1 / ${userPass}`);
    console.log("=== SAVE THESE PASSWORDS ===");
  }

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
