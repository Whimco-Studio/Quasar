// lib/generateProject.js
const fs = require("fs");
const path = require("path");

const APPS_DIR = path.join(process.cwd(), "src", "apps");
const OUT_DIR = "out";
const PROJECT_FILE = path.join(process.cwd(), "default.project.json");

function getApps() {
  if (!fs.existsSync(APPS_DIR)) return [];
  return fs.readdirSync(APPS_DIR).filter((name) =>
    fs.statSync(path.join(APPS_DIR, name)).isDirectory(),
  );
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

function generateProjectJson() {
  const apps = getApps();

  const projectJson = {
    name: "ChiselGame",
    globIgnorePaths: ["**/package.json", "**/tsconfig.json"],
    tree: {
      $className: "DataModel",

      // --- Server mounts ---
      ServerScriptService: {
        $className: "ServerScriptService",
        // Generic server root (pure Flamework style)
        TS: { $path: "out/server" },
        // Per-app servers (your apps style)
        Apps: appSection(apps, "server"),

      },

      // --- Replicated (shared) mounts ---
      ReplicatedStorage: {
        $className: "ReplicatedStorage",
        // Generic shared root (pure Flamework style)
        TS: { $path: "out/shared" },
        // Optional types output (harmless if unused)
        "typescript-types": { $path: "out/types" },
        // Per-app shared (your apps style)
        Shared: appSection(apps, "shared"),

        // rbxts + flamework includes
        rbxts_include: {
          $path: "include",
          node_modules: {
            $className: "Folder",
            "@rbxts": { $path: "node_modules/@rbxts" },
            "@flamework": { $path: "node_modules/@flamework" },
          },
        },
      },

      // --- Client mounts ---
      StarterPlayer: {
        $className: "StarterPlayer",
        StarterPlayerScripts: {
          $className: "StarterPlayerScripts",
          // Generic client root (pure Flamework style)
          TS: { $path: "out/client" },

          // Per-app clients (your apps style)
          Apps: appSection(apps, "client"),
        },
      },

      // Optional extra services (pure template parity — safe to omit)
      Workspace: { $className: "Workspace", $properties: { FilteringEnabled: true } },
      HttpService: { $className: "HttpService", $properties: { HttpEnabled: true } },
      SoundService: { $className: "SoundService", $properties: { RespectFilteringEnabled: true } },
      TestService: { $className: "TestService", $properties: { ExecuteWithStudioRun: true }, $path: "test" },
    },
  };

  fs.writeFileSync(PROJECT_FILE, JSON.stringify(projectJson, null, 2));
  console.log(`✅ Generated ${PROJECT_FILE} for apps: ${apps.join(", ")}`);
}

module.exports = { generateProjectJson };