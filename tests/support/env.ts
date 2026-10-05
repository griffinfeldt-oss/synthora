// Test environment. Uses a separate database so tests never touch dev data.
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgresql://latent:latent@localhost:5432/latent_test";
