import { BRAND } from "./brand";

/**
 * Canonical product types and categories. Fulfillment adapters map their own
 * catalog entries onto these ids; the shop filters and mockup renderer use them.
 */

export const CATEGORIES = [
  { id: "apparel", label: "Apparel" },
  { id: "art", label: "Art & Prints" },
  { id: "home", label: "Home & Living" },
  { id: "accessories", label: "Accessories" },
  { id: "paper", label: "Stickers & Paper" },
  { id: "digital", label: "Digital" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export type MockupShape =
  | "tshirt"
  | "hoodie"
  | "mug"
  | "poster"
  | "canvas"
  | "tote"
  | "sticker"
  | "phonecase"
  | "patch"
  | "digital";

export interface ProductTypeDef {
  id: string;
  label: string;
  category: CategoryId;
  shape: MockupShape;
  /** Which kinds of listing can use this type. */
  kinds: Array<"PARTNER" | "SELF_SHIP" | "DIGITAL">;
  /** Garment / material colours offered by the mockup renderer. */
  colors: string[];
  /** Hint passed to the image model so designs suit the product. */
  designHint: string;
  /** Shape of the print area, used to ask image models for the right aspect. */
  orientation: "portrait" | "landscape" | "square";
  /**
   * Typical print area in inches. Listing checks compare the design's pixels with
   * this (or with sizes in the partner's variant names) to decide print readiness.
   * null: not printed from a file (embroidery, digital downloads).
   */
  printInches: { w: number; h: number } | null;
}

/** Print resolution rules applied to designs for physical products. */
export const PRINT_QUALITY = {
  /** Below this the size is not offered: it would visibly print soft or blocky. */
  minDpi: 100,
  /** Below this the seller is warned the print may look soft. */
  goodDpi: 150,
  /** What "prints sharply up to" figures for digital files are based on. */
  idealDpi: 300,
};

export const PRODUCT_TYPES: ProductTypeDef[] = [
  {
    id: "tshirt",
    label: "T-shirt",
    category: "apparel",
    shape: "tshirt",
    kinds: ["PARTNER", "SELF_SHIP"],
    colors: ["#F4F1EA", "#1F1F24", "#3B4A5C", "#7A8B6F", "#C9B79C"],
    designHint: "centered chest print, isolated artwork, no background box",
    orientation: "portrait",
    printInches: { w: 12, h: 16 },
  },
  {
    id: "hoodie",
    label: "Hoodie",
    category: "apparel",
    shape: "hoodie",
    kinds: ["PARTNER", "SELF_SHIP"],
    colors: ["#2A2A30", "#EDEAE3", "#5B6B57", "#8C3B2E"],
    designHint: "centered chest print, bold shapes that read from a distance",
    orientation: "portrait",
    printInches: { w: 12, h: 14 },
  },
  {
    id: "mug",
    label: "Mug",
    category: "home",
    shape: "mug",
    kinds: ["PARTNER", "SELF_SHIP"],
    colors: ["#FFFFFF", "#1E1E22"],
    designHint: "wide wrap-around composition",
    orientation: "landscape",
    printInches: { w: 8.5, h: 3.5 },
  },
  {
    id: "poster",
    label: "Poster",
    category: "art",
    shape: "poster",
    kinds: ["PARTNER", "SELF_SHIP"],
    colors: ["#FFFFFF"],
    designHint: "full-bleed vertical poster composition",
    orientation: "portrait",
    printInches: { w: 12, h: 18 },
  },
  {
    id: "canvas",
    label: "Canvas print",
    category: "art",
    shape: "canvas",
    kinds: ["PARTNER", "SELF_SHIP"],
    colors: ["#FFFFFF"],
    designHint: "painterly full-bleed composition",
    orientation: "portrait",
    printInches: { w: 12, h: 16 },
  },
  {
    id: "tote",
    label: "Tote bag",
    category: "accessories",
    shape: "tote",
    kinds: ["PARTNER", "SELF_SHIP"],
    colors: ["#EFE8D8", "#1F1F24"],
    designHint: "simple centered graphic, limited colours",
    orientation: "portrait",
    printInches: { w: 14, h: 16 },
  },
  {
    id: "sticker",
    label: "Sticker",
    category: "paper",
    shape: "sticker",
    kinds: ["PARTNER", "SELF_SHIP"],
    colors: ["#FFFFFF"],
    designHint: "die-cut friendly shape with a clear silhouette",
    orientation: "square",
    printInches: { w: 4, h: 4 },
  },
  {
    id: "phonecase",
    label: "Phone case",
    category: "accessories",
    shape: "phonecase",
    kinds: ["PARTNER"],
    colors: ["#FFFFFF"],
    designHint: "tall vertical composition",
    orientation: "portrait",
    printInches: { w: 3, h: 6 },
  },
  {
    id: "patch",
    label: "Embroidered patch",
    category: "accessories",
    shape: "patch",
    kinds: ["SELF_SHIP"],
    colors: ["#1F1F24", "#F4F1EA"],
    designHint: "flat colours, thick outlines, embroidery friendly",
    orientation: "square",
    printInches: null,
  },
  {
    id: "digital_art",
    label: "Digital art file",
    category: "digital",
    shape: "digital",
    kinds: ["DIGITAL"],
    colors: ["#FFFFFF"],
    designHint: "high resolution artwork",
    orientation: "square",
    printInches: null,
  },
  {
    id: "digital_pattern",
    label: "Pattern / template",
    category: "digital",
    shape: "digital",
    kinds: ["DIGITAL"],
    colors: ["#FFFFFF"],
    designHint: "seamless repeating pattern",
    orientation: "square",
    printInches: null,
  },
];

export function productType(id: string): ProductTypeDef {
  return PRODUCT_TYPES.find((p) => p.id === id) ?? PRODUCT_TYPES[0];
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** AI tools sellers can pick from. "Other" lets them type any tool. */
export const AI_TOOLS = [
  "Midjourney",
  "DALL·E / GPT Image",
  "Stable Diffusion",
  "Adobe Firefly",
  "Ideogram",
  "Flux",
  "Leonardo",
  "Claude",
  "ChatGPT",
  "Suno",
  "Runway",
  BRAND.studioName,
] as const;
