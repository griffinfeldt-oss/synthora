// Step 1 of an upload. With S3 configured, returns a presigned PUT so large
// files go straight to the bucket (Vercel functions cap request bodies at ~4.5 MB).
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { env, mock } from "@/lib/env";
import { publicUrl } from "@/lib/storage";
import { extOf, validateUpload } from "@/lib/uploads";
import { currentUser } from "@/server/session";

const schema = z.object({ kind: z.enum(["image", "digital"]), fileName: z.string().min(1).max(200), contentType: z.string().max(100), size: z.number().int().positive() });

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user?.seller) return NextResponse.json({ error: "Sellers only" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { kind, fileName, contentType, size } = parsed.data;
  const problem = validateUpload(kind, fileName, contentType, size);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (mock.storage) return NextResponse.json({ mode: "local" });

  const ext = extOf(fileName);
  const safeName = fileName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-80);
  const key = kind === "image" ? `uploads/${user.seller.id}/${randomBytes(8).toString("hex")}.${ext}` : `digital/${user.seller.id}/${randomBytes(8).toString("hex")}/${safeName}`;
  const client = new S3Client({
    region: env.s3.region,
    endpoint: env.s3.endpoint || undefined,
    forcePathStyle: env.s3.forcePathStyle,
    credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  });
  const bucket = kind === "image" ? env.s3.publicBucket : env.s3.privateBucket || env.s3.publicBucket;
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: 600 });
  return NextResponse.json({ mode: "s3", uploadUrl, key, url: kind === "image" ? publicUrl(key) : null });
}
