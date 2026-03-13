import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const configPath = path.resolve(
  root,
  process.env.APP_CONFIG || process.argv[2] || "app.config.json"
);

function fail(message) {
  console.error(`[apply-config] ${message}`);
  process.exit(1);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function injectIntoHead(html, snippet) {
  if (/<head(\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${snippet}`);
  }
  if (/<html(\s[^>]*)?>/i.test(html)) {
    return html.replace(/<html(\s[^>]*)?>/i, (m) => `${m}<head>${snippet}</head>`);
  }
  return `<!doctype html><head>${snippet}</head>${html}`;
}

if (!fs.existsSync(configPath)) {
  fail(`Config not found: ${configPath}`);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (err) {
  fail(`Invalid JSON in ${configPath}: ${err.message}`);
}

const name = (config.name || "").trim();
const rawUrl = (config.url || "").trim();
const author = (config.author || "").trim();
const version = (config.version || "").trim();
const icon = (config.icon || "").trim();
const identifier = (config.identifier || "").trim();
const windowCfg = config.window || {};
const width = Number.isFinite(windowCfg.width) ? windowCfg.width : 1280;
const height = Number.isFinite(windowCfg.height) ? windowCfg.height : 720;
const visible =
  typeof windowCfg.visible === "boolean" ? windowCfg.visible : false;

if (!name) fail("Missing required field: name");
if (!rawUrl) fail("Missing required field: url");

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const url = normalizeUrl(rawUrl);

const escapedName = escapeHtml(name);
const escapedUrl = escapeHtml(url);

let indexHtml = "";
try {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml"
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const fetched = await res.text();
  const baseHref = new URL(url).href;
  const snippet = `
    <base href="${escapeHtml(baseHref)}">
    <meta http-equiv="refresh" content="0.3; url=${escapedUrl}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapedName}</title>
    <script>
      setTimeout(function () {
        location.replace("${escapedUrl}");
      }, 300);
    </script>`;
  indexHtml = injectIntoHead(fetched, snippet);
} catch (err) {
  console.warn(`[apply-config] Fetch HTML failed, fallback to redirect: ${err.message}`);
  indexHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=${escapedUrl}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapedName}</title>
    <script>
      location.replace("${escapedUrl}");
    </script>
  </head>
  <body></body>
</html>
`;
}

const indexPath = path.resolve(root, "src", "index.html");
fs.writeFileSync(indexPath, indexHtml, "utf8");

const tauriConfigPath = path.resolve(root, "src-tauri", "tauri.conf.json");
let tauriConfig;
try {
  tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
} catch (err) {
  fail(`Invalid JSON in ${tauriConfigPath}: ${err.message}`);
}

tauriConfig.productName = name;
if (identifier) tauriConfig.identifier = identifier;
if (version) tauriConfig.version = version;
if (tauriConfig?.app?.windows?.length) {
  tauriConfig.app.windows[0].title = name;
  tauriConfig.app.windows[0].width = width;
  tauriConfig.app.windows[0].height = height;
  tauriConfig.app.windows[0].visible = visible;
  if ("url" in tauriConfig.app.windows[0]) {
    delete tauriConfig.app.windows[0].url;
  }
}
tauriConfig.bundle = tauriConfig.bundle || {};
if (author) tauriConfig.bundle.publisher = author;

const wixSafeName = name
  .replace(/[\\/:*?"<>|]/g, " ")
  .replace(/[：]/g, " ")
  .replace(/\s+/g, " ")
  .trim();
if (wixSafeName) {
  tauriConfig.bundle.windows = tauriConfig.bundle.windows || {};
  tauriConfig.bundle.windows.wix = tauriConfig.bundle.windows.wix || {};
  tauriConfig.bundle.windows.wix.productName = wixSafeName;
}

fs.writeFileSync(
  tauriConfigPath,
  `${JSON.stringify(tauriConfig, null, 2)}\n`,
  "utf8"
);

const cargoTomlPath = path.resolve(root, "src-tauri", "Cargo.toml");
if (fs.existsSync(cargoTomlPath)) {
  let cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
  if (version) {
    const versionRegex = /^version\\s*=\\s*\".*\"/m;
    if (versionRegex.test(cargoToml)) {
      cargoToml = cargoToml.replace(versionRegex, `version = \"${version}\"`);
    } else {
      cargoToml = cargoToml.replace(
        /\\[package\\]\\n/,
        `[package]\\nversion = \"${version}\"\\n`
      );
    }
  }
  if (author) {
    const authorsRegex = /^authors\\s*=\\s*\\[.*\\]/m;
    if (authorsRegex.test(cargoToml)) {
      cargoToml = cargoToml.replace(
        authorsRegex,
        `authors = [\"${author}\"]`
      );
    } else {
      cargoToml = cargoToml.replace(
        /\\[package\\]\\n/,
        `[package]\\nauthors = [\"${author}\"]\\n`
      );
    }
  }
  fs.writeFileSync(cargoTomlPath, cargoToml, "utf8");
}

if (icon) {
  const iconPath = path.resolve(root, icon);
  if (!fs.existsSync(iconPath)) {
    fail(`Icon not found: ${iconPath}`);
  }
  const iconArgs = ["tauri", "icon", iconPath];
  const isWindows = process.platform === "win32";
  const result = isWindows
    ? spawnSync("cmd", ["/c", "npx", ...iconArgs], {
        cwd: root,
        stdio: "inherit"
      })
    : spawnSync("npx", iconArgs, {
        cwd: root,
        stdio: "inherit"
      });
  if (result.error) {
    console.error(
      `[apply-config] Failed to run tauri icon: ${result.error.message}`
    );
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("[apply-config] Done");
