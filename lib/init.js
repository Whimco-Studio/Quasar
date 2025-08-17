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

  // 1) quasar.config.json
  const qcPath = path.join(cwd, "quasar.config.json");
  if (!fs.existsSync(qcPath)) {
    writeJson(qcPath, {
      appsDir: "src/apps",
      sentinelPath: "src/quasar/__generated__/manifest-hash.ts",
      compileCmd: "rbxtsc -p tsconfig.json"
    });
    console.log("✔ wrote quasar.config.json");
  }

  // 2) tsconfig include/exclude (don’t nuke existing)
  const tsPath = path.join(cwd, "tsconfig.json");
  let ts = readJson(tsPath) ?? { compilerOptions: {} };
  ts.compilerOptions = ts.compilerOptions || {};
  if (!ts.compilerOptions.rootDir) ts.compilerOptions.rootDir = "src";
  const include = new Set(ts.include ?? []);
  include.add("src/**/*");
  ts.include = Array.from(include);
  const exclude = new Set(ts.exclude ?? []);
  exclude.add("out"); exclude.add("node_modules");
  ts.exclude = Array.from(exclude);
  writeJson(tsPath, ts);
  console.log("✔ ensured tsconfig include/exclude");

  // 3) sentinel import anchor
  const qiDir = path.join(cwd, "src", "quasar");
  const qi = path.join(qiDir, "index.ts");
  if (!fs.existsSync(qi)) {
    fs.mkdirSync(qiDir, { recursive: true });
    fs.writeFileSync(qi, `export * from "./__generated__/manifest-hash";\n`);
    console.log("✔ created src/quasar/index.ts");
  }

  // 4) package.json scripts (merge, don’t clobber)
  const pkgPath = path.join(cwd, "package.json");
  const pkg = readJson(pkgPath) ?? {};
  pkg.scripts = pkg.scripts || {};
  if (!pkg.scripts.dev) pkg.scripts.dev = "quasar watch";
  if (!pkg.scripts.build) pkg.scripts.build = "quasar build";
  writeJson(pkgPath, pkg);
  console.log("✔ added scripts: dev, build");

  // 5) OPTIONAL: install rbxts-build (only if user wants extra helpers)
  // Keeping off by default to honor “Quasar is the only watcher”.
  // Flip this flag if you *want* rbxts-build utilities available.
  const WANT_RBXTS_BUILD = false;
  if (WANT_RBXTS_BUILD) {
    const pm = detectPM(cwd);
    const hasRbxtsBuild =
      pkg.devDependencies?.["rbxts-build"] || pkg.dependencies?.["rbxts-build"];
    if (!hasRbxtsBuild) {
      const cmd =
        pm === "pnpm" ? "pnpm add -D rbxts-build" :
        pm === "yarn" ? "yarn add -D rbxts-build" :
        "npm install --save-dev rbxts-build";
      console.log(`📦 Installing rbxts-build via ${pm}…`);
      execSync(cmd, { stdio: "inherit" });
    }
    try {
      console.log("⚙️ Running rbxts-build init (optional)...");
      execSync("npx rbxts-build init", { stdio: "inherit" });
    } catch {
      console.warn("(!) rbxts-build init failed or not needed; continuing.");
    }
  }

  // 6) .gitignore hygiene
  ensureLine(path.join(cwd, ".gitignore"), "out/");
  ensureLine(path.join(cwd, ".gitignore"), "src/quasar/__generated__/");

  console.log("✅ Quasar initialized.");
};
