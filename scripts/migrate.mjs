/**
 * Applies committed migrations from drizzle/ to whatever DATABASE_URL points at.
 *
 * This is the production path. It is deliberately NOT `drizzle-kit push`:
 * push diffs the live database against the schema file and, with --force,
 * silently drops and recreates tables to resolve the difference. That is fine
 * against a throwaway dev database and catastrophic against one holding real
 * bookings and payments.
 *
 *   npm run db:migrate
 */

import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.DATABASE_URL || "file:./dev.db";
const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const db = drizzle(client);

const target = url.startsWith("file:") ? url : url.replace(/\/\/.*@/, "//***@");
console.log(`Applying migrations to ${target}…`);

await migrate(db, { migrationsFolder: "./drizzle" });

console.log("Migrations applied.");
client.close();
