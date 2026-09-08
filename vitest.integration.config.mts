import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.ALLOW_DB_TESTS !== "1" || !url || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Integration tests require ALLOW_DB_TESTS=1 and a disposable localhost database");
export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)) } }, test: { environment: "node", include: ["tests/integration/**/*.test.ts"], fileParallelism: false, testTimeout: 15000 } });
