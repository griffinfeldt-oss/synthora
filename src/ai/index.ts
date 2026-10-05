import "server-only";
import { ALL_IMAGE_MODELS } from "./image-registry.generated";
import { ALL_COPYWRITERS } from "./copy-registry.generated";
import type { Copywriter, ImageModel } from "./types";
import mockCopywriter from "./copy/mock";

export function imageModels(): ImageModel[] {
  return ALL_IMAGE_MODELS.filter((m) => m.available()).sort((a, b) => a.priority - b.priority);
}

export function defaultImageModel(): ImageModel {
  return imageModels()[0];
}

export function getImageModel(id?: string | null): ImageModel {
  return imageModels().find((m) => m.id === id) ?? defaultImageModel();
}

export function copywriter(): Copywriter {
  return ALL_COPYWRITERS.filter((c) => c.available()).sort((a, b) => a.priority - b.priority)[0] ?? mockCopywriter;
}

export { mockCopywriter };
