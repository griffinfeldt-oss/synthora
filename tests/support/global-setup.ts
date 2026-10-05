import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./env";

export default function setup() {
  // Create/refresh the test schema. Wipe happens per suite (see db.ts).
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
