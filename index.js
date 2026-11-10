// Starts the API: node server/index.js   (or: npm run server)
import http from "node:http";
import fs from "node:fs";
import mysql from "mysql2/promise";
import { createApp } from "./app.js";
import { createRepo } from "./repo.js";

try {
  process.loadEnvFile(); // reads .env if there is one
} catch {}

const env = process.env;
const flag = (value, fallback) => (value === undefined ? fallback : !/^(false|0|no|off)$/i.test(value));

const pool = mysql.createPool({
  host: env.DB_HOST || "localhost",
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || "dashboard",
  password: env.DB_PASSWORD || "",
  database: env.DB_NAME || "dashboard",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
});

const SETUP_HELP = `
Create the database and user once (as an admin user of MySQL/MariaDB), then put the same
details in .env (see .env.example):

  sudo mysql -e "CREATE DATABASE dashboard CHARACTER SET utf8mb4;
                 CREATE USER 'dashboard'@'localhost' IDENTIFIED BY 'choose-a-password';
                 GRANT ALL PRIVILEGES ON dashboard.* TO 'dashboard'@'localhost';"
`;

async function createTables() {
  const sql = fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  const statements = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) await pool.query(statement);
}

try {
  await createTables();
} catch (err) {
  console.error(`\nCan't set up the database: ${err.code || ""} ${err.message}`);
  if (["ECONNREFUSED", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR", "ENOTFOUND"].includes(err.code)) console.error(SETUP_HELP);
  process.exit(1);
}

const repo = createRepo(pool);
const app = createApp({
  repo,
  config: {
    allowedUploads: (env.ALLOWED_UPLOADS || "pdf,csv,xlsx,json").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    selfSelectRole: flag(env.SELF_SELECT_ROLE, true),
    cookieSecure: flag(env.COOKIE_SECURE, false),
  },
});

setInterval(() => repo.purgeSessions().catch(() => {}), 60 * 60 * 1000).unref(); // forget expired logins

const port = Number(env.API_PORT || 3001);
http.createServer(app).listen(port, "127.0.0.1", () => {
  console.log(`API ready on http://127.0.0.1:${port}  (database "${env.DB_NAME || "dashboard"}")`);
});
