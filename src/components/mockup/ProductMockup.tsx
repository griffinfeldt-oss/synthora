/**
 * Realistic product mockups drawn as layered SVG: silhouette → design (warped
 * slightly by a displacement map) → folds, light and shadow → material grain.
 * Works for any design URL, including PNGs from a live image model.
 *
 * Shared component (no hooks), so server and client components can both use it.
 */
import type { MockupShape } from "@/config/catalog";
import { hashString } from "@/lib/utils";

export interface MockupProps {
  shape: MockupShape | string;
  designUrl: string;
  color?: string;
  alt: string;
  className?: string;
  /** Changes the scene slightly (angle, backdrop) for a second photo. */
  variant?: number;
  /** Large single view: adds the fabric warp filter (too costly for grids). */
  detail?: boolean;
}

function luminance(hex: string): number {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ProductMockup({ shape, designUrl, color, alt, className, variant = 0, detail = false }: MockupProps) {
  const id = `m${hashString(`${shape}|${color}|${designUrl}|${variant}`).toString(36)}`;
  const garment = color ?? defaultColor(shape);
  const dark = luminance(garment) < 0.35;
  const u = (name: string) => `url(#${id}-${name})`;
  const warp = detail ? u("warp") : undefined;

  const common = (
    <>
      <radialGradient id={`${id}-bg`} cx="50%" cy="38%" r="75%">
        <stop offset="0%" stopColor="var(--mock-2)" />
        <stop offset="100%" stopColor="var(--mock-1)" />
      </radialGradient>
      <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="18" />
      </filter>
      <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="10" />
      </filter>
      {/* Pre-rendered grain tile: far cheaper to paint than a live noise filter. */}
      <pattern id={`${id}-grain`} patternUnits="userSpaceOnUse" width="160" height="160">
        <image href={dark ? "/textures/grain-light.png" : "/textures/grain-dark.png"} width="160" height="160" opacity={dark ? 0.35 : 0.5} />
      </pattern>
      {detail ? (
        <filter id={`${id}-warp`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="9" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      ) : null}
    </>
  );

  let scene: React.ReactNode;
  switch (shape) {
    case "tshirt":
      scene = <Tee id={id} u={u} warp={warp} color={garment} dark={dark} designUrl={designUrl} />;
      break;
    case "hoodie":
      scene = <Hoodie id={id} u={u} warp={warp} color={garment} dark={dark} designUrl={designUrl} />;
      break;
    case "mug":
      scene = <Mug id={id} u={u} warp={warp} color={garment} dark={dark} designUrl={designUrl} />;
      break;
    case "poster":
      scene = <Poster id={id} u={u} warp={warp} designUrl={designUrl} variant={variant} />;
      break;
    case "canvas":
      scene = <Canvas id={id} u={u} warp={warp} designUrl={designUrl} />;
      break;
    case "tote":
      scene = <Tote id={id} u={u} warp={warp} color={garment} dark={dark} designUrl={designUrl} />;
      break;
    case "sticker":
      scene = <Sticker id={id} u={u} warp={warp} designUrl={designUrl} />;
      break;
    case "phonecase":
      scene = <PhoneCase id={id} u={u} warp={warp} designUrl={designUrl} />;
      break;
    case "patch":
      scene = <Patch id={id} u={u} warp={warp} color={garment} designUrl={designUrl} />;
      break;
    default:
      scene = <Digital id={id} u={u} warp={warp} designUrl={designUrl} />;
  }

  return (
    <svg viewBox="0 0 1000 1000" role="img" aria-label={alt} className={className} preserveAspectRatio="xMidYMid slice">
      <defs>{common}</defs>
      <rect width="1000" height="1000" fill={u("bg")} />
      {scene}
    </svg>
  );
}

function defaultColor(shape: string): string {
  if (shape === "hoodie") return "#2A2A30";
  if (shape === "tote") return "#EFE8D8";
  if (shape === "patch") return "#1F1F24";
  return "#F4F1EA";
}

type U = (name: string) => string;
interface Part {
  id: string;
  u: U;
  designUrl: string;
  warp?: string;
}

// ─── T-shirt ────────────────────────────────────────────────────────────────

const TEE =
  "M410 168 C440 205 560 205 590 168 L700 200 L835 300 L772 410 L705 372 L705 860 C640 874 360 874 295 860 L295 372 L228 410 L165 300 L300 200 Z";

function Tee({ id, u, color, dark, designUrl, warp }: Part & { color: string; dark: boolean }) {
  return (
    <g>
      <defs>
        <clipPath id={`${id}-tee`}>
          <path d={TEE} />
        </clipPath>
        <linearGradient id={`${id}-side`} x1="295" x2="705" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#000" stopOpacity="0.2" />
          <stop offset="0.16" stopColor="#000" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity={dark ? 0.05 : 0.08} />
          <stop offset="0.84" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id={`${id}-top`} x1="0" x2="0" y1="170" y2="870" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity={dark ? 0.06 : 0.12} />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <ellipse cx="500" cy="885" rx="250" ry="20" fill="#000" opacity="0.22" filter={u("shadow")} />
      <path d={TEE} fill={color} />
      <path d="M410 168 C440 140 560 140 590 168 C560 205 440 205 410 168 Z" fill="#000" opacity={dark ? 0.35 : 0.14} />
      <g clipPath={u("tee")}>
        <image href={designUrl} x="375" y="255" width="250" height="250" preserveAspectRatio="xMidYMid meet" filter={warp} opacity={dark ? 0.97 : 0.94} style={{ mixBlendMode: dark ? "normal" : "multiply" }} />
        <rect x="150" y="150" width="700" height="740" fill={u("side")} />
        <rect x="150" y="150" width="700" height="740" fill={u("top")} />
        {/* folds */}
        <g filter={u("soft")} opacity="0.9">
          <path d="M335 520 C350 640 340 760 360 860" stroke="#000" strokeOpacity="0.08" strokeWidth="26" fill="none" />
          <path d="M650 480 C640 600 660 720 640 860" stroke="#000" strokeOpacity="0.07" strokeWidth="22" fill="none" />
          <path d="M300 380 C340 420 360 470 365 520" stroke="#000" strokeOpacity="0.09" strokeWidth="16" fill="none" />
          <path d="M700 380 C660 420 640 470 635 520" stroke="#000" strokeOpacity="0.09" strokeWidth="16" fill="none" />
          <path d="M470 560 C500 650 480 760 500 860" stroke="#fff" strokeOpacity={dark ? 0.05 : 0.12} strokeWidth="30" fill="none" />
        </g>
        <path d="M228 410 L295 372 M772 410 L705 372" stroke="#000" strokeOpacity="0.12" strokeWidth="3" />
        <rect x="150" y="150" width="700" height="740" fill={u("grain")} />
      </g>
      <path d="M410 168 C440 205 560 205 590 168" stroke="#000" strokeOpacity={dark ? 0.4 : 0.18} strokeWidth="9" fill="none" />
      <path d="M228 410 L165 300 M772 410 L835 300" stroke="#000" strokeOpacity="0.08" strokeWidth="2" />
    </g>
  );
}

// ─── Hoodie ─────────────────────────────────────────────────────────────────

const HOODIE =
  "M395 190 L290 225 L170 420 L148 700 L215 714 L252 470 L290 425 L290 850 C360 868 640 868 710 850 L710 425 L748 470 L785 714 L852 700 L830 420 L710 225 L605 190 C570 236 430 236 395 190 Z";

function Hoodie({ id, u, color, dark, designUrl, warp }: Part & { color: string; dark: boolean }) {
  return (
    <g>
      <defs>
        <clipPath id={`${id}-hood`}>
          <path d={HOODIE} />
        </clipPath>
        <linearGradient id={`${id}-hside`} x1="150" x2="850" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#000" stopOpacity="0.25" />
          <stop offset="0.22" stopColor="#000" stopOpacity="0.05" />
          <stop offset="0.5" stopColor="#fff" stopOpacity={dark ? 0.06 : 0.1} />
          <stop offset="0.78" stopColor="#000" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <ellipse cx="500" cy="880" rx="300" ry="22" fill="#000" opacity="0.22" filter={u("shadow")} />
      <path d="M352 238 C330 100 670 100 648 238 Z" fill={color} />
      <path d="M352 238 C330 100 670 100 648 238 Z" fill="#000" opacity="0.25" />
      <path d={HOODIE} fill={color} />
      <g clipPath={u("hood")}>
        <image href={designUrl} x="392" y="285" width="216" height="216" preserveAspectRatio="xMidYMid meet" filter={warp} />
        <path d="M368 640 L632 640 L672 792 L328 792 Z" fill="#000" opacity="0.07" stroke="#000" strokeOpacity="0.18" strokeWidth="3" />
        <rect x="290" y="818" width="420" height="40" fill="#000" opacity="0.12" />
        <rect x="148" y="680" width="80" height="40" fill="#000" opacity="0.12" transform="rotate(4 188 700)" />
        <rect x="772" y="680" width="80" height="40" fill="#000" opacity="0.12" transform="rotate(-4 812 700)" />
        <rect x="140" y="100" width="720" height="800" fill={u("hside")} />
        <g filter={u("soft")}>
          <path d="M320 470 C340 600 330 720 345 850" stroke="#000" strokeOpacity="0.1" strokeWidth="26" fill="none" />
          <path d="M680 470 C660 600 670 720 655 850" stroke="#000" strokeOpacity="0.1" strokeWidth="26" fill="none" />
          <path d="M500 520 C520 620 490 730 505 850" stroke="#fff" strokeOpacity={dark ? 0.05 : 0.1} strokeWidth="34" fill="none" />
        </g>
        <rect x="140" y="100" width="720" height="800" fill={u("grain")} />
      </g>
      <path d="M395 190 C430 262 570 262 605 190" stroke="#000" strokeOpacity="0.35" strokeWidth="10" fill="none" />
      <path d="M462 238 L452 385 M538 238 L548 385" stroke={dark ? "#d9d9d9" : "#f4f4f4"} strokeWidth="7" strokeLinecap="round" />
      <path d="M452 385 L450 405 M548 385 L550 405" stroke="#9a9a9a" strokeWidth="9" strokeLinecap="round" />
    </g>
  );
}

// ─── Mug ────────────────────────────────────────────────────────────────────

function Mug({ id, u, color, dark, designUrl }: Part & { color: string; dark: boolean }) {
  return (
    <g>
      <defs>
        <clipPath id={`${id}-mugbody`}>
          <path d="M268 285 L268 770 Q268 812 312 814 L606 814 Q650 812 650 770 L650 285 Z" />
        </clipPath>
        <linearGradient id={`${id}-cyl`} x1="268" x2="650" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#000" stopOpacity="0.32" />
          <stop offset="0.1" stopColor="#000" stopOpacity="0.1" />
          <stop offset="0.27" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="0.36" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="0.8" stopColor="#000" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000" stopOpacity="0.36" />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="0" x2="0" y1="250" y2="320" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#000" stopOpacity="0.45" />
          <stop offset="1" stopColor="#000" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <ellipse cx="470" cy="822" rx="250" ry="26" fill="#000" opacity="0.3" filter={u("shadow")} />
      <path d="M648 365 C800 345 812 655 648 650 L648 598 C748 600 748 412 648 418 Z" fill={color} />
      <path d="M648 365 C800 345 812 655 648 650 L648 598 C748 600 748 412 648 418 Z" fill="#000" opacity="0.14" />
      <path d="M268 285 L268 770 Q268 812 312 814 L606 814 Q650 812 650 770 L650 285 Z" fill={color} />
      <g clipPath={u("mugbody")}>
        <image href={designUrl} x="300" y="390" width="318" height="318" preserveAspectRatio="xMidYMid meet" style={{ mixBlendMode: dark ? "normal" : "multiply" }} />
        <rect x="260" y="270" width="400" height="560" fill={u("cyl")} />
      </g>
      <ellipse cx="459" cy="285" rx="191" ry="36" fill={color} />
      <ellipse cx="459" cy="287" rx="176" ry="28" fill={u("inner")} />
      <ellipse cx="459" cy="285" rx="191" ry="36" fill="none" stroke="#000" strokeOpacity="0.12" strokeWidth="2" />
    </g>
  );
}

// ─── Poster ─────────────────────────────────────────────────────────────────

function Poster({ id, u, designUrl, variant }: Part & { variant: number }) {
  const oak = variant % 2 === 1;
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-glare`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="0.62" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="300" y="160" width="420" height="630" fill="#000" opacity="0.35" filter={u("shadow")} transform="translate(10 18)" />
      <rect x="290" y="135" width="420" height="630" fill={oak ? "#b48a5a" : "#1c1c1f"} />
      <rect x="290" y="135" width="420" height="630" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="2" />
      <rect x="306" y="151" width="388" height="598" fill="#fff" />
      <image href={designUrl} x="306" y="151" width="388" height="598" preserveAspectRatio="xMidYMid slice" />
      <rect x="306" y="151" width="388" height="598" fill={u("glare")} />
      <rect x="306" y="151" width="388" height="598" fill="none" stroke="#000" strokeOpacity="0.2" strokeWidth="3" />
    </g>
  );
}

// ─── Canvas (gallery wrap) ──────────────────────────────────────────────────

function Canvas({ id, u, designUrl }: Part) {
  return (
    <g>
      <defs>
        <clipPath id={`${id}-side`}>
          <path d="M700 170 L734 186 L734 748 L700 730 Z" />
        </clipPath>
      </defs>
      <rect x="300" y="190" width="440" height="560" fill="#000" opacity="0.35" filter={u("shadow")} transform="translate(14 20)" />
      <image href={designUrl} x="280" y="170" width="420" height="560" preserveAspectRatio="xMidYMid slice" />
      {/* Wrapped edge: the image's right edge stretched onto a skewed side face. */}
      <g clipPath={u("side")}>
        <g transform="translate(700 170) skewY(25.2) translate(-700 -170)">
          <image href={designUrl} x="700" y="170" width="34" height="560" preserveAspectRatio="none" />
          <rect x="700" y="170" width="34" height="560" fill="#000" opacity="0.42" />
        </g>
      </g>
      <rect x="280" y="170" width="420" height="560" fill={u("grain")} />
      <rect x="280" y="170" width="420" height="560" fill="none" stroke="#000" strokeOpacity="0.12" strokeWidth="2" />
    </g>
  );
}

// ─── Tote ───────────────────────────────────────────────────────────────────

function Tote({ id, u, color, dark, designUrl, warp }: Part & { color: string; dark: boolean }) {
  return (
    <g>
      <defs>
        <clipPath id={`${id}-bag`}>
          <path d="M285 330 L715 330 L742 865 L258 865 Z" />
        </clipPath>
        <linearGradient id={`${id}-bshade`} x1="258" x2="742" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#000" stopOpacity="0.16" />
          <stop offset="0.2" stopColor="#000" stopOpacity="0" />
          <stop offset="0.75" stopColor="#000" stopOpacity="0.02" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <ellipse cx="500" cy="885" rx="270" ry="18" fill="#000" opacity="0.25" filter={u("shadow")} />
      <path d="M385 345 C372 120 478 120 465 345" stroke={color} strokeWidth="28" fill="none" />
      <path d="M535 345 C522 120 628 120 615 345" stroke={color} strokeWidth="28" fill="none" />
      <path d="M385 345 C372 120 478 120 465 345 M535 345 C522 120 628 120 615 345" stroke="#000" strokeOpacity="0.16" strokeWidth="28" fill="none" />
      <path d="M285 330 L715 330 L742 865 L258 865 Z" fill={color} />
      <g clipPath={u("bag")}>
        <image href={designUrl} x="362" y="450" width="276" height="276" preserveAspectRatio="xMidYMid meet" filter={warp} style={{ mixBlendMode: dark ? "normal" : "multiply" }} />
        <rect x="250" y="330" width="500" height="34" fill="#000" opacity="0.08" />
        <path d="M285 368 L715 368" stroke="#000" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="7 6" />
        <rect x="250" y="320" width="500" height="560" fill={u("bshade")} />
        <g filter={u("soft")}>
          <path d="M520 380 C540 520 505 700 530 860" stroke="#000" strokeOpacity="0.07" strokeWidth="30" fill="none" />
        </g>
        <rect x="250" y="320" width="500" height="560" fill={u("grain")} />
        <rect x="250" y="320" width="500" height="560" fill={u("grain")} />
      </g>
    </g>
  );
}

// ─── Sticker ────────────────────────────────────────────────────────────────

function Sticker({ id, u, designUrl }: Part) {
  return (
    <g>
      <defs>
        <filter id={`${id}-diecut`} x="-15%" y="-15%" width="130%" height="130%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="16" result="d" />
          <feGaussianBlur in="d" stdDeviation="12" result="db" />
          <feOffset in="db" dx="6" dy="14" result="so" />
          <feFlood floodColor="#000" floodOpacity="0.28" />
          <feComposite in2="so" operator="in" result="shadow" />
          <feFlood floodColor="#ffffff" />
          <feComposite in2="d" operator="in" result="border" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="border" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="1000" height="1000" fill={u("grain")} />
      <g transform="rotate(14 790 230)" opacity="0.95">
        <image href={designUrl} x="680" y="120" width="220" height="220" filter={u("diecut")} preserveAspectRatio="xMidYMid meet" />
      </g>
      <g transform="rotate(-7 480 540)">
        <image href={designUrl} x="230" y="290" width="500" height="500" filter={u("diecut")} preserveAspectRatio="xMidYMid meet" />
      </g>
    </g>
  );
}

// ─── Phone case ─────────────────────────────────────────────────────────────

function PhoneCase({ id, u, designUrl }: Part) {
  return (
    <g>
      <defs>
        <clipPath id={`${id}-case`}>
          <rect x="340" y="110" width="320" height="780" rx="58" />
        </clipPath>
        <linearGradient id={`${id}-gloss`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0.2" stopColor="#fff" stopOpacity="0.0" />
          <stop offset="0.42" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="340" x2="660" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#000" stopOpacity="0.28" />
          <stop offset="0.08" stopColor="#000" stopOpacity="0" />
          <stop offset="0.92" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <rect x="352" y="130" width="320" height="780" rx="58" fill="#000" opacity="0.35" filter={u("shadow")} />
      <g clipPath={u("case")}>
        <rect x="340" y="110" width="320" height="780" fill="#ddd" />
        <image href={designUrl} x="340" y="110" width="320" height="780" preserveAspectRatio="xMidYMid slice" />
        <rect x="340" y="110" width="320" height="780" fill={u("edge")} />
        <rect x="340" y="110" width="320" height="780" fill={u("gloss")} />
      </g>
      <rect x="340" y="110" width="320" height="780" rx="58" fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="4" />
      <rect x="366" y="136" width="146" height="146" rx="36" fill="#18181b" opacity="0.92" />
      {[
        [404, 174],
        [404, 244],
        [474, 209],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="27" fill="#0a0a0c" stroke="#3f3f46" strokeWidth="5" />
          <circle cx={cx - 7} cy={cy - 7} r="6" fill="#fff" opacity="0.35" />
        </g>
      ))}
    </g>
  );
}

// ─── Embroidered patch ──────────────────────────────────────────────────────

function Patch({ id, u, color, designUrl, warp }: Part & { color: string }) {
  return (
    <g>
      <defs>
        <pattern id={`${id}-twill`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="10" height="10" fill="#33415a" />
          <rect width="5" height="10" fill="#3b4b66" />
        </pattern>
        <pattern id={`${id}-thread`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <rect width="6" height="3" fill="#fff" opacity="0.12" />
        </pattern>
        <clipPath id={`${id}-patchc`}>
          <circle cx="500" cy="500" r="262" />
        </clipPath>
      </defs>
      <rect width="1000" height="1000" fill={u("twill")} />
      <rect width="1000" height="1000" fill={u("grain")} />
      <circle cx="510" cy="518" r="305" fill="#000" opacity="0.45" filter={u("shadow")} />
      <circle cx="500" cy="500" r="300" fill={color} />
      <g clipPath={u("patchc")}>
        <image href={designUrl} x="238" y="238" width="524" height="524" preserveAspectRatio="xMidYMid slice" filter={warp} />
        <rect x="230" y="230" width="540" height="540" fill={u("thread")} />
      </g>
      <circle cx="500" cy="500" r="281" fill="none" stroke="#18181b" strokeWidth="38" />
      <circle cx="500" cy="500" r="281" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="34" strokeDasharray="2 5" />
    </g>
  );
}

// ─── Digital download ───────────────────────────────────────────────────────

function Digital({ u, designUrl }: Part) {
  return (
    <g>
      <rect x="292" y="182" width="440" height="560" fill="#000" opacity="0.2" filter={u("shadow")} transform="rotate(6 512 462)" />
      <rect x="292" y="182" width="440" height="560" fill="#fff" transform="rotate(6 512 462)" />
      <rect x="260" y="200" width="460" height="580" fill="#000" opacity="0.28" filter={u("shadow")} transform="translate(6 14)" />
      <rect x="260" y="200" width="460" height="580" fill="#fff" />
      <image href={designUrl} x="284" y="224" width="412" height="460" preserveAspectRatio="xMidYMid slice" />
      <rect x="284" y="702" width="180" height="14" fill="#1c1c1f" opacity="0.8" />
      <rect x="284" y="728" width="110" height="10" fill="#1c1c1f" opacity="0.35" />
      <circle cx="700" cy="760" r="62" fill="var(--signal)" />
      <path d="M700 728 L700 784 M676 764 L700 788 L724 764" stroke="var(--signal-ink)" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
