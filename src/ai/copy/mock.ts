/** Template copywriter used when ANTHROPIC_API_KEY is not set. */
import type { Copywriter } from "../types";

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => (w.length > 3 || /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w));
}

function keyPhrase(prompt: string): string {
  const quoted = prompt.match(/["“]([^"”]{2,40})["”]/);
  if (quoted) return quoted[1];
  const cleaned = prompt
    .replace(/\b(a|an|the|with|of|and|in|on|for|design|make|me|please|style|that|is|my)\b/gi, " ")
    .replace(/[^a-zA-Z0-9 '-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
  return cleaned || "Untitled design";
}

const mockCopywriter: Copywriter = {
  id: "mock",
  label: "Template writer (no AI)",
  demo: true,
  priority: 100,
  available: () => true,
  async write({ prompt, productLabel, aiTool, partnerName }) {
    const phrase = titleCase(keyPhrase(prompt));
    const words = prompt.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    const tags = Array.from(new Set(words)).slice(0, 6);
    return {
      title: `${phrase} ${productLabel}`.slice(0, 80),
      description: [
        `${phrase}, made with AI and printed on a ${productLabel.toLowerCase()}.`,
        `The design started from a short brief, "${prompt.trim().slice(0, 140)}", and was picked from four AI-generated versions.`,
        partnerName ? `Made to order by ${partnerName}, so each one is printed for you.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      tags,
      howMade: `Design generated with ${aiTool} from the prompt "${prompt.trim().slice(0, 200)}". I chose one of four versions; no manual drawing.`,
    };
  },
};

export default mockCopywriter;
