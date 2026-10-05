/**
 * Demo data, created through the app's real code paths (listing creation,
 * checkout, mock payment, partner webhooks, payouts, refunds) so a fresh
 * database shows every state the dashboards can be in.
 *
 * Local/dev only: refuses to run when NODE_ENV=production.
 * Run: npm run db:seed  (wipes and recreates demo data)
 */
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { putObject } from "../src/lib/storage";
import { renderArt } from "../src/ai/art";
import { setPaymentGateway } from "../src/lib/payments";
import { MockGateway } from "../src/lib/payments/mock";
import { connectPartner, recordPlanPayment } from "../src/server/sellers";
import { createListing, type ListingInput } from "../src/server/listings";
import { startCheckout } from "../src/server/checkout";
import { markOrderPaid } from "../src/server/orders";
import { addSelfShipTracking, confirmDelivery, simulatePartnerEvent } from "../src/server/fulfillment";
import { releaseDuePayouts } from "../src/server/payouts";
import { applyRefund } from "../src/server/refunds";
import { createReview, createReport, submitTakedown } from "../src/server/trust";
import { estimateProcessingFee } from "../src/lib/fees";
import { productType } from "../src/config/catalog";
import { getProvider } from "../src/fulfillment/registry";
import { contextFor } from "../src/fulfillment/registry";

if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW !== "true") {
  console.error("Refusing to seed a production database. Set SEED_ALLOW=true if you really mean it.");
  process.exit(1);
}

// Demo-only password for every seeded account (documented in the README).
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "synthora-demo";

async function wipe() {
  const tables = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`,
  );
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

async function user(email: string, name: string, role: "BUYER" | "ADMIN" = "BUYER") {
  return db.user.create({ data: { email, name, role, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10), emailVerified: new Date() } });
}

async function seller(email: string, name: string, shop: { shopName: string; slug: string; bio: string; location: string; status?: "APPROVED" | "PENDING"; selfShip?: boolean; digital?: boolean }) {
  const u = await user(email, name);
  const s = await db.seller.create({
    data: {
      userId: u.id,
      shopName: shop.shopName,
      slug: shop.slug,
      bio: shop.bio,
      location: shop.location,
      status: shop.status ?? "APPROVED",
      stripeAccountId: `acct_mock_${shop.slug.replace(/-/g, "")}`,
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      stripeCustomerId: `cus_mock_${shop.slug.replace(/-/g, "")}`,
      subscriptionId: `sub_mock_${shop.slug.replace(/-/g, "")}`,
      subscriptionStatus: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 18 * 86400000),
      offersSelfShip: shop.selfShip ?? false,
      offersDigital: shop.digital ?? false,
    },
  });
  await recordPlanPayment(s.id, 300, `in_mock_${shop.slug}_1`);
  await recordPlanPayment(s.id, 300, `in_mock_${shop.slug}_2`);
  return s;
}

async function design(sellerId: string, prompt: string, type: string, seed: number) {
  const { svg } = renderArt({ prompt, productType: type, seed });
  const { url } = await putObject(`designs/${sellerId}/seed-${seed}-${type}.svg`, Buffer.from(svg), "image/svg+xml", "public");
  return url!;
}

interface Spec {
  prompt: string;
  type: string;
  provider: string;
  title: string;
  description: string;
  priceCents: number;
  aiTool: string;
  involvement?: "FULL" | "ASSISTED";
  howMade: string;
  tags: string[];
  colors?: string[];
  seed: number;
  inventory?: number;
  shippingCents?: number;
}

async function makeListing(s: Awaited<ReturnType<typeof seller>>, spec: Spec) {
  const designUrl = await design(s.id, spec.prompt, spec.type, spec.seed);
  const def = productType(spec.type);
  const provider = getProvider(spec.provider);
  let partnerProductId: string | null = null;
  let partnerVariantIds: string[] = [];
  if (provider.kind === "pod") {
    const catalog = await provider.listCatalog(contextFor(null));
    const product = catalog.find((p) => p.productType === spec.type)!;
    partnerProductId = product.id;
    partnerVariantIds = product.variants.slice(0, 4).map((v) => v.id);
  }
  const colors = spec.colors ?? [def.colors[0]];
  const images: ListingInput["images"] = def.shape === "digital"
    ? [
        { url: designUrl, alt: `${spec.title} preview`, kind: "MOCKUP_RENDER", mockup: { shape: "digital", color: "#FFFFFF", designUrl } },
        { url: designUrl, alt: `${spec.title} artwork`, kind: "DESIGN", mockup: null },
      ]
    : [
        ...colors.map((c) => ({ url: designUrl, alt: `${spec.title}, ${def.label.toLowerCase()}`, kind: "MOCKUP_RENDER" as const, mockup: { shape: def.shape, color: c, designUrl } })),
        { url: designUrl, alt: `${spec.title} artwork`, kind: "DESIGN" as const, mockup: null },
      ];
  let digitalAsset: ListingInput["digitalAsset"] = null;
  if (provider.kind === "digital") {
    const key = `digital/${s.id}/seed-${spec.seed}/${spec.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`;
    const { svg } = renderArt({ prompt: spec.prompt, productType: "poster", seed: spec.seed });
    await putObject(key, Buffer.from(svg), "image/svg+xml", "private");
    digitalAsset = { storageKey: key, fileName: `${spec.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`, contentType: "image/svg+xml", sizeBytes: Buffer.byteLength(svg) };
  }
  const res = await createListing(s, {
    title: spec.title,
    description: spec.description,
    priceCents: spec.priceCents,
    productType: spec.type,
    kind: provider.kind === "pod" ? "PARTNER" : provider.kind === "self" ? "SELF_SHIP" : "DIGITAL",
    provider: spec.provider,
    partnerProductId,
    partnerVariantIds,
    baseCostCents: 0,
    shippingCents: spec.shippingCents ?? null,
    processingDays: provider.kind === "self" ? 5 : 3,
    inventory: spec.inventory ?? null,
    aiTool: spec.aiTool,
    aiInvolvement: spec.involvement ?? "FULL",
    howMade: spec.howMade,
    prompt: spec.prompt,
    generationId: null,
    designUrl,
    tags: spec.tags,
    images,
    digitalAsset,
    rightsConfirmed: true,
    publish: true,
  });
  // Spread "published" dates so "newest" sorting looks natural.
  await db.listing.update({ where: { id: res.id }, data: { publishedAt: new Date(Date.now() - spec.seed * 3600_000 * 7) } });
  return res;
}

const ADDRESS = { name: "Maya Chen", line1: "418 Alder Street", line2: "Apt 3", city: "Portland", state: "OR", postalCode: "97205", country: "US" };

async function main() {
  setPaymentGateway(new MockGateway());
  console.log("Wiping database…");
  await wipe();

  const admin = await user("admin@synthora.market", "Admin", "ADMIN");
  const maya = await user("buyer@example.com", "Maya Chen");

  const night = await seller("nightshift@example.com", "Rafa Ortiz", {
    shopName: "Night Shift Prints",
    slug: "night-shift-prints",
    bio: "Late-night prompts turned into posters and tees. Every design starts in Midjourney or Flux and ships through Printful or Printify.",
    location: "Oakland, CA",
  });
  const geo = await seller("geometry@example.com", "Ines Albrecht", {
    shopName: "Quiet Geometry",
    slug: "quiet-geometry",
    bio: "Calm, structured art for walls and screens. Made with Ideogram and Firefly, printed locally by Gelato.",
    location: "Leipzig, DE",
    digital: true,
  });
  const patch = await seller("patches@example.com", "Sam Whitlock", {
    shopName: "Patchwork Robot",
    slug: "patchwork-robot",
    bio: "AI-designed embroidered patches, stitched and shipped by me, plus embroidery patterns you can download.",
    location: "Reno, NV",
    selfShip: true,
    digital: true,
  });
  const pending = await seller("newshop@example.com", "Lee Park", {
    shopName: "Frost & Pixel",
    slug: "frost-and-pixel",
    bio: "Winter landscapes. New shop, awaiting review.",
    location: "Duluth, MN",
    status: "PENDING",
  });

  for (const [s, p] of [
    [night, "printful"],
    [night, "printify"],
    [geo, "gelato"],
    [geo, "printify"],
    [patch, "printful"],
    [pending, "printify"],
  ] as const) {
    await connectPartner({ sellerId: s.id, providerId: p, credentials: null, demo: true });
  }

  console.log("Creating listings…");
  const L = {
    sunset: await makeListing(night, {
      prompt: "Retro sunset over desert mountains, 70s poster", type: "poster", provider: "printful", seed: 1,
      title: "Desert Sunset, 1974", description: "A warm, striped sun sinking behind layered desert ridges. Printed on heavy matte paper with a soft, uncoated finish.",
      priceCents: 3400, aiTool: "Midjourney", howMade: "Generated in Midjourney v7 from a short prompt about 70s travel posters. I picked one of four results and adjusted the crop for an 18×24 print. No hand drawing.",
      tags: ["sunset", "desert", "retro", "poster"],
    }),
    neonCat: await makeListing(night, {
      prompt: "Neon cat face, synthwave", type: "tshirt", provider: "printify", seed: 2,
      title: "Synthwave Cat Tee", description: "A wide-eyed neon cat in hot pink and cyan on a soft heavyweight cotton tee.",
      priceCents: 2900, aiTool: "Flux", howMade: "Made with Flux 1.1 Pro. The face was generated whole; I only removed the background so it prints cleanly on fabric.",
      tags: ["cat", "neon", "synthwave", "tee"], colors: ["#1F1F24", "#F4F1EA"],
    }),
    wave: await makeListing(night, {
      prompt: "Great wave at night under a full moon", type: "canvas", provider: "printful", seed: 3,
      title: "Night Wave Canvas", description: "Layered waves under a pale moon, gallery-wrapped on a 12×16 canvas ready to hang.",
      priceCents: 8900, aiTool: "Midjourney", involvement: "ASSISTED", howMade: "Base image from Midjourney, then I repainted the moon and cleaned up the wave edges in Photoshop. Roughly 80% AI, 20% my edits.",
      tags: ["ocean", "wave", "moon", "canvas"],
    }),
    saturn: await makeListing(night, {
      prompt: "Saturn orbit, cosmic minimal", type: "hoodie", provider: "printful", seed: 4,
      title: "Saturn Orbit Hoodie", description: "A ringed planet in orange and lilac on a heavy blend hoodie. Warm, roomy, and a little bit cosmic.",
      priceCents: 5800, aiTool: "Flux", howMade: "Generated with Flux from the prompt “Saturn orbit, cosmic minimal”. One of four versions, printed as-is.",
      tags: ["space", "saturn", "hoodie"], colors: ["#2A2A30"],
    }),
    fern: await makeListing(night, {
      prompt: "Botanical ferns and wildflowers, pastel", type: "tote", provider: "printify", seed: 5,
      title: "Wildflower Fern Tote", description: "Soft pastel ferns and blooms on a sturdy natural cotton tote. Big enough for groceries or a laptop.",
      priceCents: 2600, aiTool: "Midjourney", howMade: "Midjourney generated the floral arrangement; I chose the version with the clearest silhouette for screen-style printing.",
      tags: ["botanical", "flowers", "tote"],
    }),
    sticker: await makeListing(night, {
      prompt: "Vintage badge 'Night Shift Club'", type: "sticker", provider: "printify", seed: 6,
      title: "Night Shift Club Sticker", description: "A 3-inch kiss-cut vinyl badge for laptops, bottles and late nights.",
      priceCents: 500, aiTool: "Midjourney", howMade: "Badge layout and lettering generated in Midjourney. Text was part of the prompt, not added by hand.",
      tags: ["sticker", "badge", "vintage"],
    }),
    bauhaus: await makeListing(geo, {
      prompt: "Bauhaus geometric tiles, retro palette", type: "poster", provider: "gelato", seed: 7,
      title: "Bauhaus Tiles No. 3", description: "A grid of circles, arches and stripes in red, ochre and teal. Museum-quality matte poster, printed near you.",
      priceCents: 3200, aiTool: "Ideogram", howMade: "Generated in Ideogram 3.0 with a palette reference. I asked for 16 tiles and kept the version with the best balance.",
      tags: ["bauhaus", "geometric", "poster"],
    }),
    topoMug: await makeListing(geo, {
      prompt: "Topographic contour lines, monochrome", type: "mug", provider: "gelato", seed: 8,
      title: "Contour Lines Mug", description: "Fine topographic lines wrap around an 11 oz white ceramic mug. Dishwasher and microwave safe.",
      priceCents: 1900, aiTool: "Adobe Firefly", howMade: "Contour pattern generated in Adobe Firefly, then tiled for a seamless wrap. No manual drawing.",
      tags: ["topographic", "map", "mug"], colors: ["#FFFFFF"],
    }),
    candyCase: await makeListing(geo, {
      prompt: "Abstract bauhaus shapes, candy colors", type: "phonecase", provider: "printify", seed: 9,
      title: "Candy Bauhaus Phone Case", description: "Playful geometric shapes in pink and powder blue on a glossy tough case.",
      priceCents: 2700, aiTool: "Ideogram", howMade: "Made with Ideogram, cropped to the phone's tall format. One of four generated versions.",
      tags: ["phone case", "geometric", "pink"],
    }),
    topoPattern: await makeListing(geo, {
      prompt: "Topographic map lines, ocean palette, seamless pattern", type: "digital_pattern", provider: "digital", seed: 10,
      title: "Ocean Contours Seamless Pattern", description: "A seamless contour-line pattern in deep blues. 4096 px file for fabric, wallpaper and wrapping-paper projects.",
      priceCents: 900, aiTool: "Stable Diffusion", howMade: "Generated with Stable Diffusion XL plus a tiling setting, then checked for seams. Delivered as a high-resolution file.",
      tags: ["pattern", "seamless", "digital"],
    }),
    goldenHour: await makeListing(geo, {
      prompt: "Mountain landscape at golden hour, minimal", type: "digital_art", provider: "digital", seed: 11,
      title: "Golden Hour Ridges (Print File)", description: "Print-it-yourself wall art. High-resolution file sized for frames up to 24×36.",
      priceCents: 1200, aiTool: "Adobe Firefly", howMade: "Created in Adobe Firefly from a written brief. I chose the composition; the AI did the rest.",
      tags: ["printable", "mountains", "wall art"],
    }),
    fox: await makeListing(patch, {
      prompt: "Fox face embroidered patch, autumn colors", type: "patch", provider: "self", seed: 12,
      title: "Autumn Fox Patch", description: "A 3.5-inch iron-on patch with a satin-stitched border. Designed with AI, digitised and stitched by me.",
      priceCents: 1400, aiTool: "DALL·E / GPT Image", involvement: "ASSISTED", howMade: "Design generated with GPT Image, then I simplified the colours for thread and digitised it for my embroidery machine.",
      tags: ["patch", "fox", "embroidery"], inventory: 24, shippingCents: 400,
    }),
    owl: await makeListing(patch, {
      prompt: "Owl badge patch 'Night Owls'", type: "patch", provider: "self", seed: 13,
      title: "Night Owls Club Patch", description: "Big-eyed owl patch for jackets and bags. Iron-on backing, ships in a recycled mailer.",
      priceCents: 1400, aiTool: "DALL·E / GPT Image", involvement: "ASSISTED", howMade: "GPT Image produced the owl; I reduced it to six thread colours and stitched it.",
      tags: ["patch", "owl"], inventory: 12, shippingCents: 400,
    }),
    bear: await makeListing(patch, {
      prompt: "Bear emblem 'Camp Synthora' vintage badge", type: "patch", provider: "self", seed: 14,
      title: "Camp Synthora Bear Patch", description: "A vintage camp-style bear emblem, 4 inches, with a merrowed edge.",
      priceCents: 1600, aiTool: "Midjourney", involvement: "ASSISTED", howMade: "Midjourney badge concept, redrawn as stitch paths in my digitising software.",
      tags: ["patch", "bear", "camp"], inventory: 30, shippingCents: 400,
    }),
    bunny: await makeListing(patch, {
      prompt: "Cute bunny embroidery pattern, pastel", type: "digital_pattern", provider: "digital", seed: 15,
      title: "Pastel Bunny Embroidery Pattern", description: "A printable hand-embroidery pattern with a colour guide. Instant download.",
      priceCents: 700, aiTool: "DALL·E / GPT Image", howMade: "Pattern artwork generated with GPT Image; the stitch guide text was written by me.",
      tags: ["embroidery", "pattern", "bunny"],
    }),
    mushroom: await makeListing(patch, {
      prompt: "Mushroom forest, cottagecore, botanical", type: "tshirt", provider: "printful", seed: 16,
      title: "Mushroom Forest Tee", description: "Cottagecore mushrooms and ferns on a soft Bella+Canvas tee.",
      priceCents: 3100, aiTool: "Leonardo", howMade: "Made with Leonardo's Phoenix model. Printed as generated.",
      tags: ["mushroom", "cottagecore", "tee"], colors: ["#F4F1EA", "#7A8B6F"],
    }),
  };
  await makeListing(pending, {
    prompt: "Winter snow mountains, minimal", type: "poster", provider: "printify", seed: 17,
    title: "First Snow", description: "Quiet winter peaks in blue and white.", priceCents: 3000, aiTool: "Leonardo",
    howMade: "Generated in Leonardo from a one-line prompt; printed as generated.", tags: ["winter", "poster"],
  });

  const listingId = async (slug: string) => (await db.listing.findUniqueOrThrow({ where: { slug } })).id;
  const pay = async (orderId: string) => {
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    await markOrderPaid({ orderId, paymentIntentId: `pi_mock_${orderId}`, chargeId: `ch_mock_${orderId}`, feeCents: estimateProcessingFee(o.totalCents) });
  };
  const fulfillmentsOf = (orderId: string) => db.fulfillment.findMany({ where: { sellerOrder: { orderId } }, include: { sellerOrder: true } });

  console.log("Placing orders…");
  // A: multi-seller order, delivered and paid out, reviewed.
  const a = await startCheckout({
    items: [
      { listingId: await listingId(L.sunset.slug), quantity: 1 },
      { listingId: await listingId(L.sticker.slug), quantity: 3 },
      { listingId: await listingId(L.fox.slug), quantity: 1 },
    ],
    shipTo: ADDRESS, email: maya.email, buyerId: maya.id,
  });
  await pay(a.orderId);
  for (const f of await fulfillmentsOf(a.orderId)) {
    if (f.provider === "self") await addSelfShipTracking(patch.id, f.id, { carrier: "USPS", number: "9400111899223197428490" });
    else {
      await simulatePartnerEvent(f.id, "IN_PRODUCTION");
      await simulatePartnerEvent(f.id, "SHIPPED");
      await simulatePartnerEvent(f.id, "DELIVERED");
    }
  }
  for (const so of await db.sellerOrder.findMany({ where: { orderId: a.orderId } })) await confirmDelivery(a.orderId, so.id);
  const runA = await releaseDuePayouts();
  console.log(`  payouts released: ${runA.paid}`);
  for (const item of await db.orderItem.findMany({ where: { orderId: a.orderId } })) {
    const text: Record<string, [number, string]> = {
      [L.sunset.slug]: [5, "Colours are even richer in person. The paper feels expensive."],
      [L.sticker.slug]: [5, "Crisp print and the white border is perfect on my laptop."],
      [L.fox.slug]: [4, "Lovely stitching. Took a week to arrive but worth it."],
    };
    const listing = await db.listing.findUniqueOrThrow({ where: { id: item.listingId } });
    const [rating, body] = text[listing.slug] ?? [5, "Great."];
    await createReview(maya.id, item.id, rating, body);
  }

  // B: guest order: hoodie in production + digital pattern (download ready, payout held 3 days).
  const b = await startCheckout({
    items: [
      { listingId: await listingId(L.saturn.slug), quantity: 1 },
      { listingId: await listingId(L.topoPattern.slug), quantity: 1 },
    ],
    shipTo: { ...ADDRESS, name: "Jordan Reyes", line1: "77 Mill Road", line2: null, city: "Austin", state: "TX", postalCode: "78702" },
    email: "jordan@example.com", buyerId: null,
  });
  await pay(b.orderId);
  for (const f of await fulfillmentsOf(b.orderId)) if (f.provider === "printful") await simulatePartnerEvent(f.id, "IN_PRODUCTION");

  // C: partner rejects the order (address contains "fail") → seller must act.
  const c = await startCheckout({
    items: [{ listingId: await listingId(L.neonCat.slug), quantity: 2 }],
    shipTo: { ...ADDRESS, line1: "1 Fail Street" }, email: maya.email, buyerId: maya.id,
  });
  await pay(c.orderId);

  // D: self-ship patch paid, waiting for the seller to ship.
  const d = await startCheckout({
    items: [{ listingId: await listingId(L.owl.slug), quantity: 2 }, { listingId: await listingId(L.bunny.slug), quantity: 1 }],
    shipTo: { ...ADDRESS, name: "Priya Nair", line1: "9 Harbor Lane", line2: null, city: "Salem", state: "MA", postalCode: "01970" },
    email: "priya@example.com", buyerId: null,
  });
  await pay(d.orderId);

  // E: shipped, then partially refunded by an admin.
  const e = await startCheckout({
    items: [{ listingId: await listingId(L.bauhaus.slug), quantity: 1 }, { listingId: await listingId(L.topoMug.slug), quantity: 2 }],
    shipTo: ADDRESS, email: maya.email, buyerId: maya.id,
  });
  await pay(e.orderId);
  for (const f of await fulfillmentsOf(e.orderId)) await simulatePartnerEvent(f.id, "SHIPPED");
  const eSo = await db.sellerOrder.findFirstOrThrow({ where: { orderId: e.orderId } });
  await applyRefund({ sellerOrderId: eSo.id, amountCents: 1900, reason: "One mug arrived chipped", source: "admin", actorId: admin.id });

  // F: an unpaid, abandoned checkout.
  await startCheckout({ items: [{ listingId: await listingId(L.wave.slug), quantity: 1 }], shipTo: ADDRESS, email: "window.shopper@example.com", buyerId: null });

  console.log("Reports and notices…");
  await createReport({
    listingId: await listingId(L.owl.slug), reason: "NOT_AI_MADE",
    details: "This looks like a hand-drawn design I've seen elsewhere. Is it really AI-made?", reporterId: maya.id, email: null,
  });
  await submitTakedown({
    listingUrl: `http://localhost:3000/l/${L.candyCase.slug}`, claimantName: "Dana Holt", claimantEmail: "legal@example-studio.com",
    claimantAddress: "200 Market St, San Francisco, CA", rightsOwner: "Example Studio LLC",
    workDescription: "Our 2023 'Sweet Shapes' poster series.", infringementNote: "The phone case reproduces the composition and colours of our poster No. 4.",
    goodFaith: true, accurate: true, signature: "Dana Holt",
  });

  console.log("\nDone. Sign in with any of these (password: %s):", DEMO_PASSWORD);
  console.log("  admin@synthora.market     admin");
  console.log("  buyer@example.com       buyer with orders");
  console.log("  nightshift@example.com  seller (Printful + Printify)");
  console.log("  geometry@example.com    seller (Gelato + digital)");
  console.log("  patches@example.com     seller (self-ship + digital)");
  console.log("  newshop@example.com     seller awaiting approval");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
