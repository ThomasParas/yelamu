// After `vite build`: keep only the datasets the public site needs in dist/assets.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const KEEP = new Set(["real-city"]);
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
for (const need of KEEP) {
  if (!existsSync(join(assets, need, "meta.json"))) {
    console.error(`dist/assets/${need}/meta.json is missing: the site would be empty`);
    process.exit(1);
  }
}
