// Writes the sample artwork shown on product-type tiles in the listing wizard.
import { writeFileSync } from "node:fs";
import { renderArt } from "../src/ai/art";
writeFileSync("public/samples/design.svg", renderArt({ prompt: "retro sunset over mountains", seed: 3, productType: "tshirt" }).svg);
console.log("wrote public/samples/design.svg");
