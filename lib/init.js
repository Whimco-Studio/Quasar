// lib/init.js (CommonJS) — JSONC-safe tsconfig handling
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/** --- JSON/JSONC helpers --- **/
function stripJsonc(raw) {
  // Remove BOM
  let s = raw.replace(/^\uFEFF/, "");
  // If TypeScript is present (very likely via roblox-ts), use it to parse JSONC.
  try {
    const ts = require("typescript");
    const res = ts.parseConfigFileTextToJson("tsconfig.json", s);
    if (res.error) throw new Error("ts.parseConfigFileTextToJson error");
    return res.config;
  } catch {
    // Fallback: strip // and /* */ comments & trailing commas safely.
    let out = "";
    let i = 0, inStr = false, strQ = "", esc = false, inLine = false, inBlock = false;
    while (i < s.length) {
      const c = s[i], n = s[i + 1];
      if (inLine) {
        if (c === "\n") { inLine = false; out += c; }
        i++; continue;
      }
      if (inBlock) {
        if (c === "*" && n === "/") { inBlock = false; i += 2; continue; }
        i++; continue;
      }
      if (inStr) {
        out += c;
        if (esc) { esc = false; }
        else if (c === "\\") { esc = true; }
        else if (c === strQ) { inStr = false; }
        i++; continue;
      }
      // not in string/comment
      if (c === '"' || c === "'") { inStr = true; strQ = c; out += c; i++; continue; }
      if (c === "/" && n === "/") { inLine = true; i += 2; continue; }
      if (c === "/" && n === "*") { inBlock = true; i += 2; continue; }
      out += c; i++;
    }
    // remove trailing commas (not inside strings anymore)
    out = out.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(out);
  }
}

function readJsonC(p) {
  return fs.existsSync(p) ? stripJsonc(fs.readFileSync(p, "utf8")) : undefined;
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function detectPM(cwd) {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}
function ensureLine(file, line) {
  const exists = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (!exists.split(/\r?\n/).includes(line)) {
    fs.writeFileSync(file, (exists ? exists + "\n" : "") + line + "\n");
  }
}

/** --- CLI init --- **/
exports.run = () => {
  const cwd = process.cwd();

  // 0) Ensure required deps in the consumer project
  const pm = detectPM(cwd);
  const pkgPath = path.join(cwd, "package.json");
  const pkg = readJsonC(pkgPath) ?? {};
  const hasRbxts = pkg.devDependencies?.["roblox-ts"] || pkg.dependencies?.["roblox-ts"];
  if (!hasRbxts) {
    const cmd =
      pm === "pnpm" ? "pnpm add -D roblox-ts @rbxts/types" :
      pm === "yarn" ? "yarn add -D roblox-ts @rbxts/types" :
      "npm i -D roblox-ts @rbxts/types";
    console.log(`📦 Installing roblox-ts via ${pm}…`);
    execSync(cmd, { stdio: "inherit" });
  }
  const hasT = pkg.devDependencies?.["@rbxts/t"] || pkg.dependencies?.["@rbxts/t"];
  if (!hasT) {
    const cmdT =
      pm === "pnpm" ? "pnpm add @rbxts/t" :
      pm === "yarn" ? "yarn add @rbxts/t" :
      "npm i @rbxts/t";
    console.log(`📦 Installing @rbxts/t via ${pm}…`);
    execSync(cmdT, { stdio: "inherit" });
  }

  // 1) chisel.config.json (no compileCmd; build/watch find local rbxtsc)
  const cfgPath = path.join(cwd, "chisel.config.json");
  if (!fs.existsSync(cfgPath)) {
    writeJson(cfgPath, {
      appsDir: "src/apps",
      sentinelPath: "src/chisel/__generated__/manifest-hash.ts",
    });
    console.log("✔ wrote chisel.config.json");
  }

  // 2) tsconfig.json — JSONC-friendly merge: add only if missing
  const tsPath = path.join(cwd, "tsconfig.json");
  const ts = readJsonC(tsPath) ?? {};
  const co = { ...(ts.compilerOptions || {}) };

  // Required/recommended rbxtsc bits (don’t clobber if already set)
  if (co.allowSyntheticDefaultImports === undefined) co.allowSyntheticDefaultImports = true;
  if (co.downlevelIteration === undefined) co.downlevelIteration = true;
  if (co.module === undefined) co.module = "commonjs";
  if (co.moduleResolution === undefined) co.moduleResolution = "Node";
  if (co.noLib === undefined) co.noLib = true;
  if (co.resolveJsonModule === undefined) co.resolveJsonModule = true;
  if (co.forceConsistentCasingInFileNames === undefined) co.forceConsistentCasingInFileNames = true;
  if (co.moduleDetection === undefined) co.moduleDetection = "force";
  if (co.strict === undefined) co.strict = true;

  // If user uses JSX/Roact already, we won’t change it; otherwise leave unset.
  // Layout/perf defaults (only if missing)
  if (co.rootDir === undefined) co.rootDir = "src";
  if (co.outDir === undefined) co.outDir = "out";

  // Types
  if (!co.typeRoots) co.typeRoots = ["node_modules/@rbxts"];
  else if (!co.typeRoots.includes("node_modules/@rbxts")) co.typeRoots.push("node_modules/@rbxts");

  ts.compilerOptions = co;
  ts.include = Array.from(new Set([...(ts.include || []), "src/**/*"]));
  ts.exclude = Array.from(new Set([...(ts.exclude || []), "out", "node_modules"]));
  writeJson(tsPath, ts);
  console.log("✔ ensured tsconfig (JSONC supported; non-clobber merge)");

  // 3) sentinel import anchor
  const anchorDir = path.join(cwd, "src", "chisel");
  const anchor = path.join(anchorDir, "index.ts");
  if (!fs.existsSync(anchor)) {
    fs.mkdirSync(anchorDir, { recursive: true });
    fs.writeFileSync(anchor, `export * from "./__generated__/manifest-hash";\n`);
    console.log("✔ created src/chisel/index.ts");
  }

  // 4) package.json scripts (merge-safe)
  const pkgNow = readJsonC(pkgPath) ?? {};
  pkgNow.scripts = pkgNow.scripts || {};
  if (!pkgNow.scripts.dev) pkgNow.scripts.dev = "chisel watch";
  if (!pkgNow.scripts.build) pkgNow.scripts.build = "chisel build";
  writeJson(pkgPath, pkgNow);
  console.log("✔ added scripts: dev, build");

  // 5) .gitignore hygiene
  ensureLine(path.join(cwd, ".gitignore"), "out/");
  ensureLine(path.join(cwd, ".gitignore"), "src/chisel/__generated__/");

  console.log("✅ Chisel initialized (no tsconfig edits required).");
};
