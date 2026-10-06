import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./env";

/** Only ever touch a local database whose name ends in _test. */
function assertDisposable(url: string) {
  const u = new URL(url);
  const name = u.pathname.replace(/^\//, "");
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || !name.endsWith("_test")) {
    throw new Error(`Refusing to prepare ${u.hostname}/${name}: tests only run against a local *_test database.`);
  }
}

export default function setup() {
  assertDisposable(TEST_DATABASE_URL);
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL };
  // Empty the tables first (each suite does this too), so schema changes that add
  // required columns can be applied to the test database.
  execSync(
    `psql "${TEST_DATABASE_URL}" -v ON_ERROR_STOP=1 -q -c "DO \\$\\$ DECLARE t text; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' LOOP EXECUTE format('TRUNCATE %I CASCADE', t); END LOOP; END \\$\\$;"`,
    { env, stdio: "pipe" },
  );
  execSync("npx prisma db push --skip-generate --accept-data-loss", { env, stdio: "pipe" });
}
