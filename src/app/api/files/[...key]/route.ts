// Serves public files in local (mock) storage mode. In production, images are
// served straight from the S3 public bucket and this route returns 404.
import { readLocal } from "@/lib/storage";
import { mock } from "@/lib/env";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (!mock.storage) return new Response("Not found", { status: 404 });
  const { key } = await params;
  const file = await readLocal("public", key.map(decodeURIComponent).join("/"));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      // SVG designs are user-influenced: never let them run script.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
