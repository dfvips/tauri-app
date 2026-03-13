import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = process.argv.slice(2);

function readArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

function fail(message) {
  console.error(`[release-assets] ${message}`);
  process.exit(1);
}

const suffix = readArg("--suffix");
const outFile = readArg("--out") || "bundle-files.txt";
const configPath = path.resolve(
  root,
  process.env.APP_CONFIG || "app.config.json"
);

if (!suffix) fail("Missing required argument: --suffix");

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (err) {
  fail(`Invalid JSON in ${configPath}: ${err.message}`);
}

const rawName = String(config.name || "").trim();
if (!rawName) fail("Missing required field: name");

const safeName = rawName.replace(/[\\/:*?"<>|]/g, "_").trim();
const bundleDir = path.resolve(root, "src-tauri", "target", "release", "bundle");

if (!fs.existsSync(bundleDir)) {
  fail(`Bundle dir not found: ${bundleDir}`);
}

const renamedFiles = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".app") || entry.name.endsWith(".dSYM")) {
        continue;
      }
      walk(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;

    const base = path.basename(fullPath);
    const dotIndex = base.indexOf(".");
    const ext = dotIndex === -1 ? "" : base.slice(dotIndex + 1);
    const newBase = ext ? `${safeName}-${suffix}.${ext}` : `${safeName}-${suffix}`;
    const destPath = path.join(path.dirname(fullPath), newBase);

    if (destPath !== fullPath) {
      fs.renameSync(fullPath, destPath);
    }

    const rel = path.relative(root, destPath).split(path.sep).join("/");
    renamedFiles.push(rel);
  }
}

walk(bundleDir);

if (renamedFiles.length === 0) {
  fail("No bundle files found to upload.");
}

fs.writeFileSync(
  path.resolve(root, outFile),
  `${renamedFiles.join("\n")}\n`,
  "utf8"
);

console.log(`[release-assets] ${renamedFiles.length} files ready.`);
