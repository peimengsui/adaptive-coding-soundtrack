import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const filename = `${manifest.name}-${manifest.version}.vsix`;
const entries = execFileSync("unzip", ["-Z1", filename], { encoding: "utf8" }).trim().split("\n");
const normalizedEntries = entries.map((entry) => entry.toLowerCase());
const required = [
  "extension/dist/extension.js",
  "extension/media/player.js",
  "extension/media/player.css",
  "extension/media/icon.png",
  "extension/readme.md",
  "extension/privacy.md",
];
for (const entry of required) {
  if (!normalizedEntries.includes(entry.toLowerCase())) throw new Error(`Packaged extension is missing ${entry}`);
}

const prohibited = ["extension/src/", "extension/dist/test/", "extension/dist/integration/", "extension/node_modules/", "extension/.github/"];
for (const prefix of prohibited) {
  if (entries.some((entry) => entry.startsWith(prefix))) throw new Error(`Package contains prohibited path ${prefix}`);
}

const size = statSync(filename).size;
if (size > 2_000_000) throw new Error(`VSIX is unexpectedly large: ${size} bytes`);
process.stdout.write(`Validated ${filename}: ${entries.length} files, ${size} bytes\n`);
