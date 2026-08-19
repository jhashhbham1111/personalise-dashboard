import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

/**
 * Database client.
 *
 * Local development uses a file-backed SQLite database (`DATABASE_URL=file:./dev.db`).
 * Production points the same URL at Turso/libSQL, or swaps the driver for
 * Postgres — every query in the app goes through Drizzle, so nothing else changes.
 *
 * Next.js hot-reloads modules in dev, so the client is cached on globalThis to
 * avoid opening a new connection on every file save.
 */

const globalForDb = globalThis as unknown as {
  __dbClient?: ReturnType<typeof createClient>;
};

const url = process.env.DATABASE_URL || "file:./dev.db";

const client =
  globalForDb.__dbClient ??
  createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__dbClient = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export { schema };
export * from "./schema";
