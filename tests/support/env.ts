// Test environment. Uses a separate database so tests never touch dev data.
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgresql://synthora:synthora@localhost:5432/synthora_test";
