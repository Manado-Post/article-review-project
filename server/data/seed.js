import { Pool } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const run = async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const existing = await pool.query("SELECT COUNT(*)::int as cnt FROM users");
  const count = existing.rows[0].cnt;
  if (count > 0) {
    console.log(`Users already exist (${count} found). Skipping seed.`);
  } else {
    const genPass = () => crypto.randomBytes(4).toString("hex") + "!";
    const adminPass = genPass();
    const userPass = genPass();

    const adminHash = await bcrypt.hash(adminPass, 10);
    const userHash = await bcrypt.hash(userPass, 10);

    await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, $2)", ["admin", adminHash]);
    await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, $2)", ["user1", userHash]);

    console.log("=== Seed users created ===");
    console.log(`  admin / ${adminPass}`);
    console.log(`  user1 / ${userPass}`);
    console.log("=== SAVE THESE PASSWORDS ===");
  }

  await pool.end();
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
