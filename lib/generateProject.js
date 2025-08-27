// lib/generateProject.js
const fs = require("fs");
const path = require("path");

const CWD = process.cwd();
const APPS_DIR = path.join(CWD, "src", "apps");
const OUT_DIR = "out";
const PROJECT_FILE = path.join(CWD, "default.project.json");
const OVERRIDES_FILE = path.join(CWD, "chisel.rojo.overrides.json");

function readJson(p) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : undefined;
}
function writeIfChanged(p, s) {
  const prev = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  if (prev !== s) {
    fs.writeFileSync(p, s);
    return true;
  }
  return false;
}

function getApps() {
  if (!fs.existsSync(APPS_DIR)) return [];
  return fs
    .readdirSync(APPS_DIR)
    .filter((name) => fs.statSync(path.join(APPS_DIR, name)).isDirectory());
}
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function appSection(apps, subdir) {
  const section = { $className: "Folder" };
  for (const app of apps) {
    const folderPath = path.join(APPS_DIR, app, subdir);
    if (fs.existsSync(folderPath)) {
      section[cap(app)] = {
        $path: path.join(OUT_DIR, "apps", app, subdir).replace(/\\/g, "/"),
      };
    }
  }
  return section;
}
function ensure(obj, pathArr, defVal) {
  let cur = obj;
  for (let i = 0; i < pathArr.length - 1; i++) {
    const k = pathArr[i];
    cur[k] = cur[k] ?? {};
    cur = cur[k];
  }
  const last = pathArr[pathArr.length - 1];
  if (cur[last] === undefined) cur[last] = defVal;
  return cur[last];
}
function deepMerge(base, overlay) {
  if (overlay === undefined) return base;
  if (typeof base !== "object" || base === null) return overlay;
  if (typeof overlay !== "object" || overlay === null) return overlay;
  // arrays: overlay wins as a whole
  if (Array.isArray(base) || Array.isArray(overlay)) return overlay;
  const out = { ...base };
  for (const k of Object.keys(overlay)) {
    out[k] = deepMerge(base[k], overlay[k]);
  }
  return out;
}

function generateProjectJson() {
  const apps = getApps();

  // 1) Start from existing project (preserve user edits), or create a sane base
  const existing = readJson(PROJECT_FILE);
  const proj =
    existing ?? {
      name: "ChiselGame",
      globIgnorePaths: ["**/package.json", "**/tsconfig.json"],
      tree: { $className: "DataModel" },
    };

  // 2) Ensure required containers exist (but don’t clobber user content)
  const tree = proj.tree;
  ensure(tree, ["ServerScriptService"], { $className: "ServerScriptService" });
  ensure(tree, ["ReplicatedStorage"], { $className: "ReplicatedStorage" });
  ensure(tree, ["StarterPlayer"], { $className: "StarterPlayer" });
  ensure(tree, ["StarterPlayer", "StarterPlayerScripts"], { $className: "StarterPlayerScripts" });

  // Optional “TS” roots (create if missing; leave user changes intact)
  ensure(tree, ["ServerScriptService", "TS"], { $path: "out/server" });
  ensure(tree, ["ReplicatedStorage", "TS"], { $path: "out/shared" });
  ensure(tree, ["ReplicatedStorage", "typescript-types"], { $path: "out/types" });
  ensure(tree, ["StarterPlayer", "StarterPlayerScripts", "TS"], { $path: "out/client" });

  // rbxts/flamework includes (ensure once)
  ensure(tree, ["ReplicatedStorage", "rbxts_include"], {
    $path: "include",
    node_modules: {
      $className: "Folder",
      "@rbxts": { $path: "node_modules/@rbxts" },
      "@flamework": { $path: "node_modules/@flamework" },
    },
  });

  // 3) Replace ONLY the generator-owned dynamic sections
  tree.ServerScriptService.Apps = appSection(apps, "server");
  tree.ReplicatedStorage.Shared = appSection(apps, "shared");
  tree.StarterPlayer.StarterPlayerScripts.Apps = appSection(apps, "client");

  // 4) Apply user overrides (optional file)
  const overrides = readJson(OVERRIDES_FILE);
  if (overrides) {
    proj.tree = deepMerge(proj.tree, overrides.tree ?? {});
    // You can allow name/globIgnorePaths overrides here if you want:
    if (overrides.name) proj.name = overrides.name;
    if (overrides.globIgnorePaths) proj.globIgnorePaths = overrides.globIgnorePaths;
  }

  // 5) Write if changed
  const pretty = JSON.stringify(proj, null, 2);
  writeIfChanged(PROJECT_FILE, pretty);
  console.log(`✅ Generated ${PROJECT_FILE} for apps: ${apps.join(", ")}`);
}

module.exports = { generateProjectJson };
