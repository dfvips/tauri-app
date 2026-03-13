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
const copyDir = readArg("--copy-dir");
const bundleDirArg = readArg("--bundle-dir");
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

const safeName = rawName
  .replace(/[\\/:*?"<>|]/g, "_")
  .replace(/[：]/g, "_")
  .trim() || "App";
const renameOverride = String(process.env.RENAME_BASE_NAME || "").trim();
const baseName = renameOverride || rawName;
const outputName =
  process.platform === "win32"
    ? baseName
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/[：]/g, "_")
        .trim() || safeName
    : baseName;
function findBundleDirs(baseDir) {
  const results = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "bundle") {
          const parent = path.basename(path.dirname(fullPath));
          if (parent === "release") {
            results.push(fullPath);
            continue;
          }
        }
        walk(fullPath);
      }
    }
  }
  if (fs.existsSync(baseDir)) {
    walk(baseDir);
  }
  return results;
}

let bundleDir = null;
if (bundleDirArg) {
  const candidate = path.resolve(root, bundleDirArg);
  if (fs.existsSync(candidate)) {
    bundleDir = candidate;
  }
}

if (!bundleDir) {
  const targetRoot = path.resolve(root, "src-tauri", "target");
  const candidates = findBundleDirs(targetRoot);
  if (candidates.length === 0) {
    fail(`Bundle dir not found under: ${targetRoot}`);
  }
  candidates.sort((a, b) => {
    const aStat = fs.statSync(a);
    const bStat = fs.statSync(b);
    return bStat.mtimeMs - aStat.mtimeMs;
  });
  bundleDir = candidates[0];
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
    const newBase = ext
      ? `${outputName}-${suffix}.${ext}`
      : `${outputName}-${suffix}`;
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

fs.writeFileSync(path.resolve(root, outFile), `${renamedFiles.join("\n")}\n`, "utf8");

if (copyDir) {
  const absoluteCopyDir = path.resolve(root, copyDir);
  fs.mkdirSync(absoluteCopyDir, { recursive: true });
  for (const rel of renamedFiles) {
    const src = path.resolve(root, rel);
    const dest = path.join(absoluteCopyDir, path.basename(rel));
    fs.copyFileSync(src, dest);
  }
}

console.log(`[release-assets] ${renamedFiles.length} files ready.`);
