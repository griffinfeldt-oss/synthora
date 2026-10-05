/** Mock image model: procedural SVG artwork, no API key needed. */
import type { ImageModel } from "../types";
import { renderArt } from "../art";
import { BRAND } from "@/config/brand";

const mockImageModel: ImageModel = {
  id: "mock",
  label: `${BRAND.studioName} (demo model)`,
  priority: 100,
  available: () => true,
  async generate({ prompt, productType, count, seed }) {
    const base = seed ?? Math.floor(Math.random() * 10_000);
    return Array.from({ length: count }, (_, i) => {
      const s = base + i;
      const { svg } = renderArt({ prompt, productType, seed: s });
      return { data: Buffer.from(svg, "utf8"), contentType: "image/svg+xml", ext: "svg", seed: s };
    });
  },
};

export default mockImageModel;
