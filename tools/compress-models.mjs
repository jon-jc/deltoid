// Compress the Blender exports for the web.
//
//   node tools/compress-models.mjs
//
// Reads assets/blender/export/*.glb (written by assets/blender/scripts/export_all.py)
// and writes meshopt-compressed copies to public/models. Node names are kept,
// because the app finds landmarks and zones by name.
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "assets/blender/export";
const OUT = "public/models";
const BUDGET = 1.5 * 1024 * 1024;

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".glb")).sort()) {
  execSync(
    `npx --yes @gltf-transform/cli@4.5.1 meshopt "${join(SRC, file)}" "${join(OUT, file)}" --level high`,
    { stdio: "ignore" },
  );
  const size = statSync(join(OUT, file)).size;
  total += size;
  console.log(`${file.padEnd(22)} ${(size / 1024).toFixed(1).padStart(8)} KB`);
}
console.log(`${"total".padEnd(22)} ${(total / 1024).toFixed(1).padStart(8)} KB  (budget ${(BUDGET / 1024).toFixed(0)} KB)`);
if (total > BUDGET) {
  console.error("Over the model budget.");
  process.exit(1);
}
