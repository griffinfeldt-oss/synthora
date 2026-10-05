/**
 * Procedural artwork for mock mode. Turns a plain-words prompt into a
 * deterministic SVG design (palette and motif chosen from the words, layout
 * from the seed), so the "Make one with AI" flow is demoable with no API key.
 */
import { hashString, seededRandom } from "@/lib/utils";

type Rng = () => number;
interface Palette {
  name: string;
  bg: string;
  ink: string;
  a: [string, string, string];
}

const PALETTES: Palette[] = [
  { name: "sunset", bg: "#2B1B3D", ink: "#F6E7CB", a: ["#F28F3B", "#C8553D", "#FFD5A0"] },
  { name: "ocean", bg: "#0B2A3C", ink: "#E8F1F2", a: ["#1B98E0", "#7FD1B9", "#F4D35E"] },
  { name: "forest", bg: "#1E2D24", ink: "#EDE6D6", a: ["#4F7942", "#A3B18A", "#DDA15E"] },
  { name: "neon", bg: "#0D0221", ink: "#F5F5F5", a: ["#FF2E97", "#00F0FF", "#FDFF00"] },
  { name: "pastel", bg: "#FFF4E6", ink: "#3D405B", a: ["#E07A5F", "#81B29A", "#F2CC8F"] },
  { name: "mono", bg: "#F4F1EA", ink: "#16161A", a: ["#16161A", "#8A8A8F", "#C9C4B8"] },
  { name: "desert", bg: "#F3E9DC", ink: "#3B2418", a: ["#C0855A", "#E0B07B", "#7A4E2D"] },
  { name: "space", bg: "#070B1F", ink: "#EDEBF7", a: ["#6C63FF", "#FF8C42", "#B8B5FF"] },
  { name: "candy", bg: "#FFE5EC", ink: "#2D1E2F", a: ["#FB6F92", "#A2D2FF", "#FFC8DD"] },
  { name: "autumn", bg: "#2E1F14", ink: "#F5E6CC", a: ["#D9622B", "#E8A33D", "#8C3B2E"] },
  { name: "winter", bg: "#EAF2F8", ink: "#1B2A41", a: ["#324A5F", "#9BB7D4", "#E4572E"] },
  { name: "botanical", bg: "#F1EFE7", ink: "#1F3A2F", a: ["#2F6B4F", "#C9A227", "#E8B4A2"] },
  { name: "retro", bg: "#F2E8CF", ink: "#2B2D42", a: ["#E63946", "#F4A261", "#2A9D8F"] },
  { name: "vapor", bg: "#1A1033", ink: "#FCE7F3", a: ["#F472B6", "#22D3EE", "#A78BFA"] },
];

const PALETTE_WORDS: Array<[RegExp, string]> = [
  [/sunset|dusk|golden hour|warm/i, "sunset"],
  [/ocean|sea|wave|surf|beach|water|lake|whale/i, "ocean"],
  [/forest|wood|pine|moss|green|fern|mushroom/i, "forest"],
  [/neon|cyber|synth|glow|electric|rave/i, "neon"],
  [/pastel|soft|gentle|baby|nursery|cute/i, "pastel"],
  [/black and white|monochrome|mono|ink|minimal|line art/i, "mono"],
  [/desert|sand|cactus|canyon|terracotta|boho/i, "desert"],
  [/space|galaxy|cosmic|planet|star|astronaut|moon|night/i, "space"],
  [/candy|pink|sweet|bubblegum|kawaii/i, "candy"],
  [/autumn|fall|harvest|pumpkin|rust/i, "autumn"],
  [/winter|snow|ice|frost|cold|ski/i, "winter"],
  [/botanical|flower|floral|plant|garden|leaf|bloom/i, "botanical"],
  [/retro|vintage|70s|80s|groovy|diner/i, "retro"],
  [/vapor|dream|holo|iridescent|purple/i, "vapor"],
];

type Motif = "landscape" | "waves" | "cosmic" | "botanical" | "geometric" | "topo" | "creature" | "badge";

const MOTIF_WORDS: Array<[RegExp, Motif]> = [
  [/cat|kitten|fox|bear|owl|dog|puppy|bunny|rabbit|creature|animal/i, "creature"],
  [/badge|emblem|patch|club|crest|logo/i, "badge"],
  [/ocean|sea|wave|surf|beach|tide|water/i, "waves"],
  [/space|galaxy|cosmic|planet|star|astronaut|orbit|saturn/i, "cosmic"],
  [/moon/i, "cosmic"],
  [/mountain|landscape|sunset|desert|hill|valley|sun|canyon/i, "landscape"],
  [/flower|floral|plant|leaf|botanical|garden|fern|bloom/i, "botanical"],
  [/map|topo|contour|terrain|lines|fingerprint/i, "topo"],
  [/geometric|bauhaus|modern|abstract|shape|minimal|grid|pattern/i, "geometric"],
];

/** Products that print an isolated graphic rather than a full-bleed image. */
const ISOLATED = new Set(["tshirt", "hoodie", "tote", "sticker", "patch", "mug"]);

const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const r2 = (n: number) => Math.round(n * 100) / 100;

function choosePalette(prompt: string, rng: Rng, seed: number): Palette {
  const hit = PALETTE_WORDS.find(([re]) => re.test(prompt));
  const base = hit ? PALETTES.find((p) => p.name === hit[1])! : PALETTES[hashString(prompt) % PALETTES.length];
  // Variations rotate the accents so the four versions differ.
  const k = seed % 3;
  const a = [base.a[k % 3], base.a[(k + 1) % 3], base.a[(k + 2) % 3]] as [string, string, string];
  return rng() < 0.2 && !hit ? { ...base, bg: base.ink, ink: base.bg, a } : { ...base, a };
}

function chooseMotif(fullPrompt: string, seed: number): Motif {
  const prompt = fullPrompt.replace(/["“][^"”]*["”]/g, " ");
  const hit = MOTIF_WORDS.find(([re]) => re.test(prompt)) ?? MOTIF_WORDS.find(([re]) => re.test(fullPrompt));
  if (hit) return hit[1];
  const all: Motif[] = ["landscape", "geometric", "topo", "botanical", "waves", "cosmic"];
  return all[(hashString(prompt) + seed) % all.length];
}

function quotedText(prompt: string): string | null {
  const m = prompt.match(/["“'‘]([^"”'’]{2,28})["”'’]/);
  return m ? m[1] : null;
}

// ─── Motifs (drawn in a 1000×1000 box) ───────────────────────────────────────

function landscape(rng: Rng, p: Palette): string {
  const sunY = 330 + rng() * 120;
  const sunR = 150 + rng() * 70;
  let out = `<circle cx="500" cy="${r2(sunY)}" r="${r2(sunR)}" fill="${p.a[0]}"/>`;
  // horizontal sun stripes
  for (let i = 0; i < 5; i++) {
    const y = sunY + sunR * 0.15 + i * (sunR * 0.17);
    out += `<rect x="${r2(500 - sunR)}" y="${r2(y)}" width="${r2(sunR * 2)}" height="${r2(6 + i * 4)}" fill="${p.bg}"/>`;
  }
  const layers = [p.a[1], p.a[2], p.ink];
  layers.forEach((color, li) => {
    const base = 560 + li * 110;
    let d = `M0 1000 L0 ${base}`;
    const peaks = 4 + Math.floor(rng() * 3);
    for (let i = 0; i <= peaks; i++) {
      const x = (i / peaks) * 1000;
      const y = base - (rng() * 160 + 40) * (i % 2 === 0 ? 1 : 0.35);
      d += ` L${r2(x)} ${r2(y)}`;
    }
    d += " L1000 1000 Z";
    out += `<path d="${d}" fill="${color}" opacity="${li === 2 ? 1 : 0.95}"/>`;
  });
  return out;
}

function waves(rng: Rng, p: Palette): string {
  let out = `<circle cx="${r2(320 + rng() * 360)}" cy="${r2(280 + rng() * 60)}" r="${r2(110 + rng() * 40)}" fill="${p.a[2]}"/>`;
  const rows = 7;
  for (let i = 0; i < rows; i++) {
    const y = 470 + i * 75;
    const amp = 30 + rng() * 30;
    const len = 160 + rng() * 80;
    let d = `M-50 1050 L-50 ${y}`;
    for (let x = -50; x <= 1100; x += len) {
      d += ` Q${r2(x + len / 4)} ${r2(y - amp)} ${r2(x + len / 2)} ${y} T${r2(x + len)} ${y}`;
    }
    d += " L1100 1050 Z";
    const color = [p.a[0], p.a[1], p.ink][i % 3];
    out += `<path d="${d}" fill="${color}" stroke="${p.bg}" stroke-width="6"/>`;
  }
  return out;
}

function cosmic(rng: Rng, p: Palette): string {
  let out = "";
  for (let i = 0; i < 70; i++) {
    out += `<circle cx="${r2(rng() * 1000)}" cy="${r2(rng() * 1000)}" r="${r2(rng() * 3 + 0.8)}" fill="${p.ink}" opacity="${r2(0.4 + rng() * 0.6)}"/>`;
  }
  const cx = 420 + rng() * 160;
  const cy = 440 + rng() * 120;
  const r = 190 + rng() * 60;
  const tilt = -20 + rng() * 40;
  out += `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(r * 1.9)}" ry="${r2(r * 0.42)}" fill="none" stroke="${p.a[1]}" stroke-width="22" transform="rotate(${r2(tilt)} ${r2(cx)} ${r2(cy)})" opacity="0.9"/>`;
  out += `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${p.a[0]}"/>`;
  for (let i = 0; i < 4; i++) {
    out += `<path d="M${r2(cx - r)} ${r2(cy - r * 0.5 + i * r * 0.32)} Q${r2(cx)} ${r2(cy - r * 0.62 + i * r * 0.32)} ${r2(cx + r)} ${r2(cy - r * 0.5 + i * r * 0.32)}" stroke="${p.a[2]}" stroke-width="${r2(10 + rng() * 14)}" fill="none" opacity="0.55"/>`;
  }
  out += `<path d="M${r2(cx - r * 1.9)} ${r2(cy)} A${r2(r * 1.9)} ${r2(r * 0.42)} 0 0 0 ${r2(cx + r * 1.9)} ${r2(cy)}" fill="none" stroke="${p.a[1]}" stroke-width="22" transform="rotate(${r2(tilt)} ${r2(cx)} ${r2(cy)})"/>`;
  out += `<circle cx="${r2(160 + rng() * 120)}" cy="${r2(170 + rng() * 80)}" r="${r2(40 + rng() * 25)}" fill="${p.a[2]}"/>`;
  return out;
}

function botanical(rng: Rng, p: Palette): string {
  let out = "";
  const stems = 5 + Math.floor(rng() * 3);
  for (let s = 0; s < stems; s++) {
    const angle = -70 + (s / (stems - 1)) * 140 + (rng() - 0.5) * 12;
    const len = 330 + rng() * 140;
    const color = [p.a[0], p.ink, p.a[0]][s % 3];
    out += `<g transform="translate(500 900) rotate(${r2(angle)})">`;
    out += `<path d="M0 0 Q${r2((rng() - 0.5) * 60)} ${r2(-len / 2)} 0 ${r2(-len)}" stroke="${color}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
    const leaves = 4 + Math.floor(rng() * 3);
    for (let l = 1; l <= leaves; l++) {
      const y = -(len * l) / (leaves + 1);
      const size = 60 - l * 4 + rng() * 20;
      for (const side of [-1, 1]) {
        out += `<path d="M0 ${r2(y)} q${r2(side * size)} ${r2(-size * 0.25)} ${r2(side * size * 1.25)} ${r2(-size * 0.9)} q${r2(-side * size * 0.9)} ${r2(size * 0.05)} ${r2(-side * size * 1.25)} ${r2(size * 0.9)}Z" fill="${color}"/>`;
      }
    }
    out += `</g>`;
  }
  for (let f = 0; f < 3; f++) {
    const cx = 250 + rng() * 500;
    const cy = 220 + rng() * 280;
    const petals = 6 + Math.floor(rng() * 4);
    const pr = 38 + rng() * 26;
    let flower = "";
    for (let i = 0; i < petals; i++) {
      flower += `<ellipse cx="0" cy="${r2(-pr)}" rx="${r2(pr * 0.45)}" ry="${r2(pr)}" transform="rotate(${r2((360 / petals) * i)})" fill="${p.a[f % 2 === 0 ? 2 : 1]}"/>`;
    }
    out += `<g transform="translate(${r2(cx)} ${r2(cy)})">${flower}<circle r="${r2(pr * 0.45)}" fill="${p.a[0]}"/></g>`;
  }
  return out;
}

function geometric(rng: Rng, p: Palette): string {
  const n = 4;
  const size = 1000 / n;
  const colors = [p.a[0], p.a[1], p.a[2], p.ink];
  let out = "";
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = i * size;
      const y = j * size;
      const c1 = pick(rng, colors);
      const c2 = pick(rng, colors.filter((c) => c !== c1));
      const kind = Math.floor(rng() * 5);
      out += `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${c1}"/>`;
      if (kind === 0) out += `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size * 0.38}" fill="${c2}"/>`;
      else if (kind === 1) {
        // Quarter circle anchored on one corner of the tile (centre, start, end; always clockwise).
        const s = size;
        const quarters = [
          [x, y, x + s, y, x, y + s],
          [x + s, y, x + s, y + s, x, y],
          [x + s, y + s, x, y + s, x + s, y],
          [x, y + s, x, y, x + s, y + s],
        ];
        const [cx, cy, sx, sy, ex, ey] = quarters[Math.floor(rng() * 4)];
        out += `<path d="M${cx} ${cy} L${sx} ${sy} A${s} ${s} 0 0 1 ${ex} ${ey}Z" fill="${c2}"/>`;
      } else if (kind === 2) out += `<path d="M${x} ${y + size} L${x + size / 2} ${y} L${x + size} ${y + size}Z" fill="${c2}"/>`;
      else if (kind === 3) {
        for (let k = 0; k < 4; k++) out += `<rect x="${x}" y="${r2(y + k * (size / 4) + size / 12)}" width="${size}" height="${r2(size / 12)}" fill="${c2}"/>`;
      } else out += `<rect x="${x + size * 0.2}" y="${y + size * 0.2}" width="${size * 0.6}" height="${size * 0.6}" fill="${c2}" transform="rotate(45 ${x + size / 2} ${y + size / 2})"/>`;
    }
  }
  return `<g clip-path="url(#tile-clip)">${out}</g>`;
}

function topo(rng: Rng, p: Palette): string {
  let out = "";
  const centers = [
    [300 + rng() * 150, 350 + rng() * 150],
    [600 + rng() * 150, 600 + rng() * 150],
  ];
  centers.forEach(([cx, cy], ci) => {
    for (let k = 1; k <= 14; k++) {
      const base = k * 32;
      let d = "";
      const steps = 40;
      for (let s = 0; s <= steps; s++) {
        const t = (s / steps) * Math.PI * 2;
        const wobble = 1 + 0.12 * Math.sin(t * 3 + ci + k * 0.3) + 0.06 * Math.sin(t * 5 + k);
        const x = cx + Math.cos(t) * base * wobble;
        const y = cy + Math.sin(t) * base * wobble * 0.85;
        d += `${s === 0 ? "M" : "L"}${r2(x)} ${r2(y)} `;
      }
      out += `<path d="${d}Z" fill="none" stroke="${k % 4 === 0 ? p.a[0] : ci ? p.a[1] : p.ink}" stroke-width="${k % 4 === 0 ? 6 : 3}" opacity="0.9"/>`;
    }
  });
  return out;
}

function creature(rng: Rng, p: Palette, fullPrompt: string): string {
  // Words in quotes are printed text, not the subject.
  const prompt = fullPrompt.replace(/["“'‘][^"”'’]*["”'’]/g, " ");
  const pointy = /cat|fox|kitten|wolf/i.test(prompt);
  const round = /bear|panda|mouse/i.test(prompt);
  const owl = /owl|bird/i.test(prompt);
  const body = p.a[0];
  let ears = "";
  if (owl) {
    ears = `<path d="M330 330 L300 210 L420 300Z M670 330 L700 210 L580 300Z" fill="${body}"/>`;
  } else if (round) {
    ears = `<circle cx="320" cy="300" r="85" fill="${body}"/><circle cx="680" cy="300" r="85" fill="${body}"/><circle cx="320" cy="300" r="45" fill="${p.a[2]}"/><circle cx="680" cy="300" r="45" fill="${p.a[2]}"/>`;
  } else if (pointy) {
    ears = `<path d="M270 420 L300 170 L450 300Z M730 420 L700 170 L550 300Z" fill="${body}"/><path d="M305 360 L318 235 L400 310Z M695 360 L682 235 L600 310Z" fill="${p.a[2]}"/>`;
  } else {
    ears = `<ellipse cx="300" cy="330" rx="70" ry="140" fill="${body}" transform="rotate(-25 300 330)"/><ellipse cx="700" cy="330" rx="70" ry="140" fill="${body}" transform="rotate(25 700 330)"/>`;
  }
  const eyeR = owl ? 85 : 42 + rng() * 10;
  const eyes = owl
    ? `<circle cx="400" cy="500" r="${eyeR}" fill="${p.ink}"/><circle cx="600" cy="500" r="${eyeR}" fill="${p.ink}"/><circle cx="400" cy="500" r="40" fill="${p.bg}"/><circle cx="600" cy="500" r="40" fill="${p.bg}"/>`
    : `<circle cx="405" cy="520" r="${r2(eyeR)}" fill="${p.bg}"/><circle cx="595" cy="520" r="${r2(eyeR)}" fill="${p.bg}"/><circle cx="415" cy="510" r="${r2(eyeR * 0.35)}" fill="${p.ink}"/><circle cx="605" cy="510" r="${r2(eyeR * 0.35)}" fill="${p.ink}"/>`;
  const nose = owl
    ? `<path d="M470 580 L530 580 L500 650Z" fill="${p.a[1]}"/>`
    : `<path d="M470 610 Q500 640 530 610 Q500 600 470 610Z" fill="${p.ink}"/><path d="M500 630 Q470 680 430 660 M500 630 Q530 680 570 660" stroke="${p.ink}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  const whiskers = pointy
    ? `<path d="M380 630 L230 600 M380 650 L230 680 M620 630 L770 600 M620 650 L770 680" stroke="${p.ink}" stroke-width="7" stroke-linecap="round"/>`
    : "";
  const cheeks = `<circle cx="340" cy="620" r="36" fill="${p.a[1]}" opacity="0.7"/><circle cx="660" cy="620" r="36" fill="${p.a[1]}" opacity="0.7"/>`;
  return `${ears}<ellipse cx="500" cy="540" rx="260" ry="235" fill="${body}"/>${cheeks}${eyes}${nose}${whiskers}`;
}

function badge(rng: Rng, p: Palette, prompt: string): string {
  const words = (quotedText(prompt) ?? prompt.replace(/[^a-zA-Z ]/g, " ").trim().split(/\s+/).slice(0, 3).join(" ")).toUpperCase();
  const rays = 24;
  let out = `<circle cx="500" cy="500" r="430" fill="${p.ink}"/><circle cx="500" cy="500" r="405" fill="${p.bg}"/>`;
  for (let i = 0; i < rays; i++) {
    out += `<path d="M500 500 L${r2(500 + Math.cos(((i * 360) / rays) * (Math.PI / 180)) * 330)} ${r2(500 + Math.sin(((i * 360) / rays) * (Math.PI / 180)) * 330)} L${r2(500 + Math.cos((((i + 0.5) * 360) / rays) * (Math.PI / 180)) * 330)} ${r2(500 + Math.sin((((i + 0.5) * 360) / rays) * (Math.PI / 180)) * 330)}Z" fill="${p.a[1]}" opacity="0.35"/>`;
  }
  out += `<circle cx="500" cy="500" r="210" fill="${p.a[0]}"/>`;
  out += `<path d="M330 560 L420 420 L480 500 L560 380 L670 560Z" fill="${p.ink}"/>`;
  out += `<path id="badge-arc" d="M160 500 A340 340 0 0 1 840 500" fill="none"/>`;
  out += `<text font-family="Georgia, 'Playfair Display', serif" font-size="74" font-weight="700" letter-spacing="10" fill="${p.ink}"><textPath href="#badge-arc" startOffset="50%" text-anchor="middle">${escapeXml(words.slice(0, 22))}</textPath></text>`;
  out += `<text x="500" y="800" font-family="Georgia, serif" font-size="46" letter-spacing="18" text-anchor="middle" fill="${p.ink}">EST · ${2020 + Math.floor(rng() * 7)}</text>`;
  return out;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

export interface ArtResult {
  svg: string;
  palette: string;
  motif: Motif;
}

export function renderArt(input: { prompt: string; seed: number; productType: string }): ArtResult {
  const prompt = input.prompt.slice(0, 400);
  const rng = seededRandom(hashString(prompt) ^ (input.seed * 2654435761));
  const palette = choosePalette(prompt, rng, input.seed);
  const motif = chooseMotif(prompt, input.seed);
  const isolated = ISOLATED.has(input.productType);
  const text = quotedText(prompt);

  let art = "";
  switch (motif) {
    case "landscape":
      art = landscape(rng, palette);
      break;
    case "waves":
      art = waves(rng, palette);
      break;
    case "cosmic":
      art = cosmic(rng, palette);
      break;
    case "botanical":
      art = botanical(rng, palette);
      break;
    case "geometric":
      art = geometric(rng, palette);
      break;
    case "topo":
      art = topo(rng, palette);
      break;
    case "creature":
      art = creature(rng, palette, prompt);
      break;
    case "badge":
      art = badge(rng, palette, prompt);
      break;
  }

  const variant = input.seed % 4;
  // Isolated designs sit inside a shape (circle, arch, rounded square, or free).
  const clip =
    variant === 0
      ? `<circle cx="500" cy="500" r="430"/>`
      : variant === 1
        ? `<path d="M90 920 L90 480 A410 410 0 0 1 910 480 L910 920Z"/>`
        : variant === 2
          ? `<rect x="90" y="90" width="820" height="820" rx="120"/>`
          : `<circle cx="500" cy="500" r="430"/>`;

  const typeBlock = text
    ? `<g><rect x="${isolated ? 120 : 80}" y="${isolated ? 760 : 820}" width="${isolated ? 760 : 840}" height="${isolated ? 120 : 110}" fill="${palette.ink}"/><text x="500" y="${isolated ? 842 : 897}" text-anchor="middle" font-family="Georgia, 'Playfair Display', serif" font-style="italic" font-size="${text.length > 16 ? 56 : 72}" fill="${palette.bg}">${escapeXml(text)}</text></g>`
    : "";

  const grain = `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${input.seed}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.09 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>`;

  const body = isolated
    ? `<defs><clipPath id="shape">${clip}</clipPath><clipPath id="tile-clip">${clip}</clipPath>${grain}</defs>
<g clip-path="url(#shape)"><rect width="1000" height="1000" fill="${palette.bg}"/>${art}</g>
<g clip-path="url(#shape)" filter="url(#grain)"><rect width="1000" height="1000" fill="#000"/></g>${typeBlock}`
    : `<defs><clipPath id="tile-clip"><rect width="1000" height="1000"/></clipPath>${grain}</defs>
<rect width="1000" height="1000" fill="${palette.bg}"/>${art}${typeBlock}
<rect width="1000" height="1000" fill="#000" filter="url(#grain)"/>`;

  // "slice" on the root makes the art fill any frame (posters, phone cases) when used as an <image>.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1024" height="1024" preserveAspectRatio="${isolated ? "xMidYMid meet" : "xMidYMid slice"}">${body}</svg>`;
  return { svg, palette: palette.name, motif };
}
