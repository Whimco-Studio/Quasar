// lib/watch.js
const chokidar = require("chokidar");
const picomatch = require("picomatch");
const { spawn } = require("node:child_process");
const fs = require("fs");
const path = require("path");
const { emit } = require("./emitSentinel");
const { generateProjectJson } = require("./generateProject");

function loadConfig() {
  const p = path.join(process.cwd(), "quasar.config.json");
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  return {
    appsDir: "src/apps",
    sentinelPath: "src/quasar/__generated__/manifest-hash.ts",
    compileCmd: "rbxtsc -p tsconfig.json",
  };
}
const cfg = loadConfig();
const APPS_DIR = path.join(process.cwd(), cfg.appsDir);
const isManifestFile = picomatch(
  ["src/apps/*/server/**/*.ts", "src/apps/*/shared/**/*.ts", "src/global/shared/**/*.ts"],
  { dot: true }
);

function sh(cmd) {
  return new Promise((res) => {
    const p = spawn(cmd, { shell: true, stdio: "inherit" });
    p.on("exit", (code) => res(code ?? 0));
  });
}

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
      `// generated client stub for ${app}\n` +
      `export const client = { ping: () => warn("[${app}] stub") } as const;\n`;
    writeIfChanged(out, content);
  }
}

module.exports.run = () => {
  let running = false;
  let queued = false;
  let timer = null;
  let changedPath = null;

  const debounce = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(pipeline, 80); // align with rbxtsc's ~100ms batch window
  };

  async function pipeline() {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      // Keep Rojo project fresh (optional; cheap)
      generateProjectJson();

      const runCodegen = !changedPath || isManifestFile(changedPath);
      if (runCodegen) {
        const m = stamp(APPS_DIR);
        emitClients(APPS_DIR, m.apps);
        emit(m, cfg.sentinelPath);
      }

      // Always compile after any TS change
      const code = await sh(cfg.compileCmd);
      if (code !== 0) console.error(`[rbxtsc] exited with code ${code}`);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        setTimeout(pipeline, 50);
      }
    }
  }

  function onEvent(fsPath) {
    changedPath = fsPath ? fsPath.replace(/\\/g, "/") : null;
    debounce();
  }

  chokidar
    .watch(
      [
        "src/**/*.ts",
        "src/**/*.tsx",
        "!out/**",
        "!lib/**",
        "!dist/**",
        "!node_modules/**",
      ],
      {
        ignoreInitial: false,
        awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
      }
    )
    .on("add", onEvent)
    .on("change", onEvent)
    .on("unlink", onEvent)
    .on("ready", () => {
      console.log("[quasar] watch ready — building once…");
      changedPath = null; // force codegen on first build
      pipeline().catch((e) => console.error(e));
    });
};
