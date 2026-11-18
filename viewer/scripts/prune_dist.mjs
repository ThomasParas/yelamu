// After `vite build`: keep only the datasets the public site needs in dist/assets.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// Each kept folder with a file it must contain (plants: the tree models, see src/vegetation/glb.ts).
const KEEP = new Map([
  ["real-city", "meta.json"],
  ["plants", "oak.glb"],
]);
const assets = join(import.meta.dirname, "..", "dist", "assets");
if (!existsSync(assets)) {
  console.error("dist/assets not found: run `vite build` first");
  process.exit(1);
}
for (const entry of readdirSync(assets, { withFileTypes: true })) {
  // Built bundles are files (index-*.js, index-*.css); datasets are folders.
  if (entry.isDirectory() && !KEEP.has(entry.name)) {
    rmSync(join(assets, entry.name), { recursive: true });
    console.log(`removed dist/assets/${entry.name}`);
  }
}
for (const [need, file] of KEEP) {
  if (!existsSync(join(assets, need, file))) {
    console.error(`dist/assets/${need}/${file} is missing: the site would be incomplete`);
    process.exit(1);
  }
}
