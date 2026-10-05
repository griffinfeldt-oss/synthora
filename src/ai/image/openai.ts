/**
 * OpenAI Images (gpt-image-1 by default). Set OPENAI_API_KEY to enable;
 * OPENAI_IMAGE_MODEL overrides the model.
 */
import type { ImageModel } from "../types";
import { productType } from "@/config/catalog";
import { env, mock } from "@/lib/env";

interface ImagesResponse {
  data: Array<{ b64_json?: string; url?: string }>;
}

async function generateOne(prompt: string, transparent: boolean): Promise<Buffer> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.openaiImageModel,
      prompt,
      n: 1,
      size: "1024x1024",
      ...(env.openaiImageModel.startsWith("gpt-image") && transparent ? { background: "transparent" } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image model error (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as ImagesResponse;
  const item = json.data[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer());
  throw new Error("Image model returned no image");
}

const openaiImageModel: ImageModel = {
  id: "openai",
  get label() {
    return `OpenAI ${env.openaiImageModel}`;
  },
  priority: 10,
  available: () => !mock.imageModel,
  async generate({ prompt, productType: type, count }) {
    const def = productType(type);
    const transparent = ["tshirt", "hoodie", "tote", "sticker", "patch", "mug"].includes(def.id);
    const full = [
      `Artwork for a ${def.label.toLowerCase()}: ${prompt}.`,
      `Composition: ${def.designHint}.`,
      "Print-ready flat artwork only. No product mockup, no watermark, no border.",
      transparent ? "Transparent background around the artwork." : "",
    ]
      .filter(Boolean)
      .join(" ");
    // One request per image keeps this compatible with models that only allow n=1.
    const buffers = await Promise.all(Array.from({ length: count }, () => generateOne(full, transparent)));
    return buffers.map((data, i) => ({ data, contentType: "image/png", ext: "png", seed: i }));
  },
};

export default openaiImageModel;
