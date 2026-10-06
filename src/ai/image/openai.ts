/**
 * OpenAI Images (gpt-image-1 by default). Set OPENAI_API_KEY to enable;
 * OPENAI_IMAGE_MODEL overrides the model.
 *
 * The largest size the model offers is requested in the product's orientation.
 * Whether that is enough pixels for a given print size is decided later by the
 * listing checks (src/server/listing-checks.ts), not claimed here.
 */
import type { ImageModel } from "../types";
import { productType } from "@/config/catalog";
import { LAUNCH } from "@/config/launch";
import { env, mock } from "@/lib/env";

interface ImagesResponse {
  data: Array<{ b64_json?: string }>;
}

function sizeFor(typeId: string): "1024x1024" | "1024x1536" | "1536x1024" {
  const def = productType(typeId);
  if (def.orientation === "portrait") return "1024x1536";
  if (def.orientation === "landscape") return "1536x1024";
  return "1024x1024";
}

async function generateOne(prompt: string, size: string, transparent: boolean, signal?: AbortSignal): Promise<Buffer> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.openaiImageModel,
      prompt,
      n: 1,
      size,
      ...(env.openaiImageModel.startsWith("gpt-image") && transparent ? { background: "transparent" } : {}),
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image model error (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as ImagesResponse;
  const item = json.data[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  // URL responses are not fetched: the server only downloads from hosts it controls.
  throw new Error("Image model returned no image data");
}

const openaiImageModel: ImageModel = {
  id: "openai",
  get label() {
    return `OpenAI ${env.openaiImageModel}`;
  },
  priority: 10,
  estCostCentsPerImage: LAUNCH.ai.estImageCostCents,
  available: () => !mock.imageModel,
  async generate({ prompt, productType: type, count, signal }) {
    const def = productType(type);
    const transparent = ["tshirt", "hoodie", "tote", "sticker", "patch", "mug"].includes(def.id);
    const full = [
      `Artwork for a ${def.label.toLowerCase()}: ${prompt}.`,
      `Composition: ${def.designHint}.`,
      "Flat artwork only. No product mockup, no watermark, no border.",
      transparent ? "Transparent background around the artwork." : "",
    ]
      .filter(Boolean)
      .join(" ");
    const size = sizeFor(type);
    // One request per image keeps this compatible with models that only allow n=1.
    const buffers = await Promise.all(Array.from({ length: count }, () => generateOne(full, size, transparent, signal)));
    return buffers.map((data, i) => ({ data, contentType: "image/png", ext: "png", seed: i }));
  },
};

export default openaiImageModel;
