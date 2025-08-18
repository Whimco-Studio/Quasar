// lib/init.js (CommonJS)
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function readJson(p) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : undefined;
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

exports.run = () => {
  const cwd = process.cwd();

  // 0) Ensure required deps in the consumer project
  const pm = detectPM(cwd);
  const pkgPath = path.join(cwd, "package.json");
  const pkg = readJson(pkgPath) ?? {};
  const hasRbxts = pkg.devDependencies?.["roblox-ts"] || pkg.dependencies?.["roblox-ts"];
  if (!hasRbxts) {
    const cmd =
      pm === "pnpm" ? "pnpm add -D roblox-ts @rbxts/types" :
      pm === "yarn" ? "yarn add -D roblox-ts @rbxts/types" :
      "npm i -D roblox-ts @rbxts/types";
    console.log(`📦 Installing roblox-ts via ${pm}…`);
    execSync(cmd, { stdio: "inherit" });
  }
  // Templates use @rbxts/t — install if missing
  const hasT = pkg.devDependencies?.["@rbxts/t"] || pkg.dependencies?.["@rbxts/t"];
  if (!hasT) {
    const cmdT =
      pm === "pnpm" ? "pnpm add @rbxts/t" :
      pm === "yarn" ? "yarn add @rbxts/t" :
      "npm i @rbxts/t";
    console.log(`📦 Installing @rbxts/t via ${pm}…`);
    execSync(cmdT, { stdio: "inherit" });
  }

  // 1) chisel.config.json (no compileCmd; build/watch resolve local rbxtsc)
  const qcPath = path.join(cwd, "chisel.config.json");
  if (!fs.existsSync(qcPath)) {
    writeJson(qcPath, {
      appsDir: "src/apps",
      sentinelPath: "src/chisel/__generated__/manifest-hash.ts"
    });
    console.log("✔ wrote chisel.config.json");
  }

  // 2) tsconfig.json — merge-safe, matches plain roblox-ts baseline you posted
  const tsPath = path.join(cwd, "tsconfig.json");
  const ts = readJson(tsPath) ?? {};
  const co = { ...(ts.compilerOptions || {}) };

  // required + recommended options (only set if not already defined)
  if (co.allowSyntheticDefaultImports === undefined) co.allowSyntheticDefaultImports = true;
  if (co.downlevelIteration === undefined) co.downlevelIteration = true;
  if (co.jsx === undefined) co.jsx = "react";
  if (co.jsxFactory === undefined) co.jsxFactory = "Roact.createElement";
  if (co.jsxFragmentFactory === undefined) co.jsxFragmentFactory = "Roact.createFragment";
  if (co.module === undefined) co.module = "commonjs";
  if (co.moduleResolution === undefined) co.moduleResolution = "Node";
  if (co.noLib === undefined) co.noLib = true;
  if (co.resolveJsonModule === undefined) co.resolveJsonModule = true;
  if (co.experimentalDecorators === undefined) co.experimentalDecorators = true;
  if (co.forceConsistentCasingInFileNames === undefined) co.forceConsistentCasingInFileNames = true;
  if (co.moduleDetection === undefined) co.moduleDetection = "force";
  if (co.strict === undefined) co.strict = true;

  // project layout / perf
  if (co.rootDir === undefined) co.rootDir = "src";
  if (co.outDir === undefined) co.outDir = "out";
  if (co.baseUrl === undefined) co.baseUrl = "src";
  if (co.incremental === undefined) co.incremental = true;
  if (co.tsBuildInfoFile === undefined) co.tsBuildInfoFile = "out/tsconfig.tsbuildinfo";

  // target/libs — plain template uses ESNext
  if (co.target === undefined) co.target = "ESNext";
  if (co.lib === undefined) co.lib = ["ES2021"]; // harmless with target ESNext; adjust if you prefer

  // types
  if (!co.typeRoots) co.typeRoots = ["node_modules/@rbxts"];
  else if (!co.typeRoots.includes("node_modules/@rbxts")) co.typeRoots.push("node_modules/@rbxts");

  ts.compilerOptions = co;

  // include/exclude
  ts.include = Array.from(new Set([...(ts.include || []), "src/**/*"]));
  ts.exclude = Array.from(new Set([...(ts.exclude || []), "out", "node_modules"]));

  writeJson(tsPath, ts);
  console.log("✔ ensured tsconfig (roblox-ts baseline + include/exclude)");

  // 3) sentinel import anchor
  const qiDir = path.join(cwd, "src", "chisel");
  const qi = path.join(qiDir, "index.ts");
  if (!fs.existsSync(qi)) {
    fs.mkdirSync(qiDir, { recursive: true });
    fs.writeFileSync(qi, `export * from "./__generated__/manifest-hash";\n`);
    console.log("✔ created src/chisel/index.ts");
  }

  // 4) package.json scripts (merge, don’t clobber)
  const pkgNow = readJson(pkgPath) ?? {};
  pkgNow.scripts = pkgNow.scripts || {};
  if (!pkgNow.scripts.dev) pkgNow.scripts.dev = "chisel watch";
  if (!pkgNow.scripts.build) pkgNow.scripts.build = "chisel build";
  writeJson(pkgPath, pkgNow);
  console.log("✔ added scripts: dev, build");

  // 5) .gitignore hygiene
  ensureLine(path.join(cwd, ".gitignore"), "out/");
  ensureLine(path.join(cwd, ".gitignore"), "src/chisel/__generated__/");

  console.log("✅ Chisel initialized.");
};
