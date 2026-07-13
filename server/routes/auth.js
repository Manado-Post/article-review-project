import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { getDb } from "../db/init.js";
import { config } from "../config.js";

const router = Router();

// Rate limit: 15 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." },
});

router.use(authLimiter);

// Username format validation
const isValidUsername = (u) => /^[a-zA-Z0-9._-]{3,30}$/.test(u);

router.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password diperlukan." });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: "Username 3-30 karakter (huruf, angka, . _ -)." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password minimal 8 karakter." });
  }
  if (password.length > 128) {
    return res.status(400).json({ error: "Password terlalu panjang (maksimal 128 karakter)." });
  }

  try {
    const db = await getDb();
    const stmt = db.prepare("SELECT id FROM users WHERE username = ?");
    stmt.bind([username]);
    const existing = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (existing) {
      return res.status(409).json({ error: "Username sudah terdaftar." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [
      username,
      passwordHash,
    ]);

    const lastId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    const token = jwt.sign(
      { id: lastId, username },
      config.jwtSecret,
      { expiresIn: "24h", algorithm: "HS256" }
    );

    res.status(201).json({ token, user: { id: lastId, username } });
  } catch (err) {
    res.status(500).json({ error: "Gagal mendaftarkan akun." });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password diperlukan." });
  }

  try {
    const db = await getDb();
    const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
    stmt.bind([username]);
    const user = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!user) {
      return res.status(401).json({ error: "Username atau password salah." });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Username atau password salah." });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      config.jwtSecret,
      { expiresIn: "24h", algorithm: "HS256" }
    );

    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: "Gagal login." });
  }
});

router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], config.jwtSecret, { algorithms: ["HS256"] });
    const db = await getDb();
    const stmt = db.prepare("SELECT id, username, created_at FROM users WHERE id = ?");
    stmt.bind([decoded.id]);
    const user = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    if (!user) {
      return res.status(404).json({ error: "User tidak ditemukan." });
    }
    res.json({ user });
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
});

export default router;
