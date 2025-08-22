// lib/build.js
const fs = require("fs");
const path = require("path");
const { spawn } = require("node:child_process");
const { emit } = require("./emitSentinel");

function rbxtscBin() {
  const ext = process.platform === "win32" ? ".cmd" : "";
  const local = path.join(process.cwd(), "node_modules", ".bin", "rbxtsc" + ext);
  return fs.existsSync(local) ? `"${local}"` : "rbxtsc";
}

function loadConfig() {
  const p = path.join(process.cwd(), "chisel.config.json");
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  return {
    appsDir: "src/apps",
    sentinelPath: "src/chisel/__generated__/manifest-hash.ts",
    // compileCmd intentionally omitted here; we derive a safe default below
  };
}

function compileCmdFrom(cfg) {
  const cmd = cfg && typeof cfg.compileCmd === "string" ? cfg.compileCmd.trim() : "";
  return cmd.length > 0 ? cmd : `${rbxtscBin()} -p tsconfig.json`;
}

const cfg = loadConfig();
const COMPILE_CMD = compileCmdFrom(cfg);
const APPS_DIR = path.join(process.cwd(), cfg.appsDir);

function stamp(appsDir) {
  const apps = fs.existsSync(appsDir)
    ? fs.readdirSync(appsDir).filter((n) => fs.statSync(path.join(appsDir, n)).isDirectory())
    : [];

  const stamp = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const s = fs.statSync(p);
      if (s.isDirectory()) walk(p);
      else if (/\.(ts|tsx|d\.ts)$/.test(name)) {
        stamp.push([path.relative(process.cwd(), p), s.mtimeMs]);
      }
    }
  }

  for (const app of apps) {
    for (const sub of ["server", "shared"]) {
      walk(path.join(appsDir, app, sub));
    }
  }
  return { apps, stamp };
}

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

function emitClients(appsDir, apps) {
  for (const app of apps) {
    const out = path.join(appsDir, app, "client", "gen", "index.client.ts");
    const content =
      `// generated client stub for ${app}\n`;
    writeIfChanged(out, content);
  }
}

function sh(cmd) {
  return new Promise((res) => {
    const p = spawn(cmd, { shell: true, stdio: "inherit" });
    p.on("exit", (code) => res(code ?? 0));
  });
}

exports.run = async () => {
  // 1) codegen FIRST
  const m = stamp(APPS_DIR);
  emitClients(APPS_DIR, m.apps);
  emit(m, cfg.sentinelPath);

  // 2) one-shot compile (config-driven with safe fallback)
  const code = await sh(COMPILE_CMD);
  process.exit(code);
};
