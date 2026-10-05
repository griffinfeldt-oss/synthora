/**
 * Listing copy written by Claude. Set ANTHROPIC_API_KEY to enable.
 * Uses structured outputs so the response is always a valid ListingCopy.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { Copywriter } from "../types";
import { mock } from "@/lib/env";

const ListingCopySchema = z.object({
  title: z.string().describe("Product title, at most 70 characters, no quotes, no emoji"),
  description: z.string().describe("Two or three short sentences a shopper would read"),
  tags: z.array(z.string()).describe("Three to six lowercase search tags"),
  howMade: z
    .string()
    .describe("One or two first-person sentences disclosing how AI was used to make the design"),
});

const SYSTEM = `You write product listings for Synthora, a marketplace where every product is made with AI and says so.
Write plainly and specifically. Describe what the buyer gets and what the design looks like.
Never claim the design was hand-drawn. Never invent materials, sizes or certifications that are not given.`;

let client: Anthropic | null = null;

const anthropicCopywriter: Copywriter = {
  id: "anthropic",
  label: "Claude",
  priority: 10,
  available: () => !mock.copywriter,
  async write({ prompt, productLabel, aiTool, partnerName, style }) {
    client ??= new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ListingCopySchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `Product: ${productLabel}${partnerName ? ` (printed on demand by ${partnerName})` : ""}`,
            `AI tool used: ${aiTool}`,
            `The seller's design brief: "${prompt}"`,
            style ? `Tone: ${style}` : "",
            "Write the listing.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      throw new Error("The copywriter could not write this listing. Try rewording the brief.");
    }
    const out = response.parsed_output;
    return { ...out, title: out.title.slice(0, 80), tags: out.tags.slice(0, 6) };
  },
};

export default anthropicCopywriter;
