// Creates .env from .env.example with fresh secrets. Safe to re-run: it never
// overwrites an existing .env.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (existsSync(".env")) {
  console.log(".env already exists; leaving it alone.");
  process.exit(0);
}
let env = readFileSync(".env.example", "utf8");
const set = (key, value) => {
  env = env.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
};
set("AUTH_SECRET", randomBytes(32).toString("base64"));
set("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
set("CRON_SECRET", randomBytes(24).toString("hex"));
set("PRINTIFY_WEBHOOK_SECRET", randomBytes(24).toString("hex"));
set("PRINTFUL_WEBHOOK_SECRET", randomBytes(24).toString("hex"));
set("GELATO_WEBHOOK_SECRET", randomBytes(24).toString("hex"));
writeFileSync(".env", env);
console.log("Wrote .env with generated secrets. Every integration starts in mock mode.");
