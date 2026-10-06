/**
 * Technical checks run on every listing version before a person reviews it.
 * The result (the manifest) is stored on the version and summarised to buyers.
 *
 * Checks confirm files are intact and fit for the product. They say nothing about
 * copyright or originality; that is the human reviewer's (limited) job.
 */
import "server-only";
import type { Asset, LicenseVersion } from "@prisma/client";
import { PRINT_QUALITY, productType } from "@/config/catalog";
import { sha256Hex, sniff, svgProblem, zipProblem } from "@/lib/file-inspect";
import { readAssetBytes } from "./assets";

export interface FileFacts {
  role: "design" | "deliverable";
  assetId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string | null;
  width: number | null;
  height: number | null;
  vector: boolean;
  entries?: number;
}

export interface PrintFit {
  size: string;
  inches: { w: number; h: number };
  dpi: number | null;
  verdict: "ok" | "soft" | "too_small";
}

export interface Manifest {
  checkedAt: string;
  passed: boolean;
  problems: string[];
  warnings: string[];
  files: FileFacts[];
  print: PrintFit[];
  /** For digital images: the largest print at PRINT_QUALITY.idealDpi. null = vector (any size). */
  sharpUpToInches: { w: number; h: number } | null;
  license: { id: string; name: string } | null;
  images: { count: number; mockups: number };
  disclosure: { aiTool: string; howMadeChars: number; generationRecorded: boolean };
}

export interface CheckInput {
  kind: "PARTNER" | "SELF_SHIP" | "DIGITAL";
  productTypeId: string;
  title: string;
  description: string;
  aiTool: string;
  howMade: string;
  designAsset: Asset | null;
  deliverableAsset: Asset | null;
  license: LicenseVersion | null;
  variantNames: string[];
  images: Array<{ kind: string }>;
  generationRecorded: boolean;
}

/** Sizes like 12×16, 12x16, 12″ × 16″ or 18"x24" in a partner's variant name. */
export function parseInches(name: string): { w: number; h: number } | null {
  const m = name.match(/(\d+(?:\.\d+)?)\s*(?:″|"|in)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:″|"|in)?/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 && w < 100 && h < 100 ? { w, h } : null;
}

/**
 * Pixels per inch when the design is printed on an area.
 * "cover": full-bleed products (posters, canvas) scale the design to fill the area.
 * "fit": placements (shirts, totes) scale it to fit inside.
 * Either orientation is allowed, since prints can be rotated.
 */
export function effectiveDpi(px: { width: number; height: number }, inches: { w: number; h: number }, mode: "cover" | "fit"): number {
  const at = (w: number, h: number) => (mode === "cover" ? Math.min(px.width / w, px.height / h) : Math.max(px.width / w, px.height / h));
  return Math.round(Math.max(at(inches.w, inches.h), at(inches.h, inches.w)));
}

const FULL_BLEED = ["poster", "canvas", "phonecase", "mug"];

async function inspectFile(asset: Asset, role: FileFacts["role"], problems: string[]): Promise<FileFacts> {
  const facts: FileFacts = {
    role,
    assetId: asset.id,
    fileName: asset.fileName,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    sha256: asset.sha256,
    width: asset.width,
    height: asset.height,
    vector: asset.contentType === "image/svg+xml",
  };
  const bytes = await readAssetBytes(asset);
  if (!bytes) {
    problems.push(`The ${role} file (${asset.fileName}) is missing from storage.`);
    return facts;
  }
  const hash = sha256Hex(bytes);
  if (asset.sha256 && asset.sha256 !== hash) problems.push(`The ${role} file (${asset.fileName}) changed after it was checked. Upload it again.`);
  facts.sha256 = hash;
  if (bytes.length !== asset.sizeBytes) problems.push(`The ${role} file (${asset.fileName}) is not the size it was uploaded at.`);
  const detected = sniff(bytes);
  if (detected?.family === "vector") {
    const p = svgProblem(bytes);
    if (p) problems.push(p);
  }
  if (detected?.family === "archive") {
    const z = zipProblem(bytes);
    if (z.problem) problems.push(z.problem);
    facts.entries = z.entries;
  }
  return facts;
}

export async function runListingChecks(input: CheckInput): Promise<Manifest> {
  const problems: string[] = [];
  const warnings: string[] = [];
  const files: FileFacts[] = [];
  const print: PrintFit[] = [];
  const def = productType(input.productTypeId);

  if (input.title.trim().length < 3) problems.push("Add a title.");
  if (input.description.trim().length < 10) problems.push("Add a description.");
  if (!input.aiTool.trim()) problems.push("Name the AI tool you used.");
  if (input.howMade.trim().length < 20) problems.push("Say how it was made (at least a sentence).");
  if (input.images.length === 0) problems.push("Add at least one image.");

  if (input.kind === "DIGITAL") {
    if (!input.deliverableAsset) problems.push("Add the file buyers will download.");
    if (!input.license) problems.push("Choose a licence for buyers.");
  }
  if (input.kind === "PARTNER" && !input.designAsset) problems.push("Add the print file for your partner.");

  const design = input.designAsset ? await inspectFile(input.designAsset, "design", problems) : null;
  if (design) files.push(design);
  // A studio design sold as a digital file is both the design and the deliverable.
  const deliverable: FileFacts | null = !input.deliverableAsset
    ? null
    : design && input.deliverableAsset.id === input.designAsset?.id
      ? { ...design, role: "deliverable" }
      : await inspectFile(input.deliverableAsset, "deliverable", problems);
  if (deliverable) files.push(deliverable);

  // Print resolution for partner products.
  if (input.kind === "PARTNER" && design && def.printInches) {
    const sizes = input.variantNames.map((n) => ({ name: n, inches: parseInches(n) })).filter((s) => s.inches);
    const targets = sizes.length ? sizes.map((s) => ({ size: s.name, inches: s.inches! })) : [{ size: `${def.label} print area`, inches: def.printInches }];
    for (const t of targets) {
      if (design.vector || !design.width || !design.height) {
        print.push({ size: t.size, inches: t.inches, dpi: null, verdict: design.vector ? "ok" : "too_small" });
        if (!design.vector) problems.push("We couldn't read the design's pixel size.");
        continue;
      }
      const dpi = effectiveDpi({ width: design.width, height: design.height }, t.inches, FULL_BLEED.includes(def.id) ? "cover" : "fit");
      const verdict = dpi < PRINT_QUALITY.minDpi ? "too_small" : dpi < PRINT_QUALITY.goodDpi ? "soft" : "ok";
      print.push({ size: t.size, inches: t.inches, dpi, verdict });
    }
    const bad = print.filter((p) => p.verdict === "too_small");
    const soft = print.filter((p) => p.verdict === "soft");
    if (bad.length && bad.length === print.length) {
      problems.push(
        `The design is ${design.width}×${design.height} px, too small to print at ${bad.map((b) => b.size).join(", ")} (needs at least ${PRINT_QUALITY.minDpi} DPI). Use a larger file or a smaller product size.`,
      );
    } else if (bad.length) {
      warnings.push(`Too small for ${bad.map((b) => b.size).join(", ")}: remove ${bad.length === 1 ? "that size" : "those sizes"} or use a larger file.`);
    }
    if (soft.length) warnings.push(`May print soft at ${soft.map((s) => s.size).join(", ")} (under ${PRINT_QUALITY.goodDpi} DPI).`);
  }

  let sharpUpToInches: Manifest["sharpUpToInches"] = null;
  if (deliverable && deliverable.width && deliverable.height && !deliverable.vector) {
    sharpUpToInches = {
      w: Math.round((deliverable.width / PRINT_QUALITY.idealDpi) * 10) / 10,
      h: Math.round((deliverable.height / PRINT_QUALITY.idealDpi) * 10) / 10,
    };
  }

  return {
    checkedAt: new Date().toISOString(),
    passed: problems.length === 0,
    problems,
    warnings,
    files,
    print,
    sharpUpToInches,
    license: input.license ? { id: input.license.id, name: input.license.name } : null,
    images: { count: input.images.length, mockups: input.images.filter((i) => i.kind.startsWith("MOCKUP")).length },
    disclosure: { aiTool: input.aiTool, howMadeChars: input.howMade.trim().length, generationRecorded: input.generationRecorded },
  };
}
