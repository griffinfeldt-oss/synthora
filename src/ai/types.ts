/**
 * AI provider contracts. Like fulfillment partners, each model is one file in
 * src/ai/image/ or src/ai/copy/, picked up by `npm run gen`.
 */

export interface GeneratedImage {
  data: Buffer;
  contentType: string;
  ext: string;
  seed: number;
}

export interface ImageModel {
  id: string;
  /** Shown to buyers as the AI tool, e.g. "OpenAI gpt-image-1". */
  label: string;
  /** True when the model's API key is configured. The mock is always available. */
  available(): boolean;
  /** Lower runs first when several models are available. */
  priority: number;
  generate(input: { prompt: string; productType: string; count: number; seed?: number }): Promise<GeneratedImage[]>;
}

export interface ListingCopy {
  title: string;
  description: string;
  tags: string[];
  howMade: string;
}

export interface CopyInput {
  prompt: string;
  productLabel: string;
  aiTool: string;
  partnerName: string;
  style?: string;
}

export interface Copywriter {
  id: string;
  label: string;
  available(): boolean;
  priority: number;
  write(input: CopyInput): Promise<ListingCopy>;
}
