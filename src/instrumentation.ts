// Runs once when a server instance starts. In live mode a misconfigured
// deployment refuses to start instead of taking payments half-mocked.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertReadyToServe } = await import("./lib/readiness");
    assertReadyToServe();
  }
}
