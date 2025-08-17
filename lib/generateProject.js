// lib/generateProject.js
const fs = require("fs");
const path = require("path");

const APPS_DIR = path.join(process.cwd(), "src", "apps");
const OUT_DIR = "out";
const PROJECT_FILE = path.join(process.cwd(), "default.project.json");

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

function generateProjectJson() {
  const apps = getApps();
  const projectJson = {
    name: "QuasarGame",
    tree: {
      $className: "DataModel",
      ReplicatedStorage: {
        $className: "ReplicatedStorage",
        Shared: appSection(apps, "shared"),
        rbxts_include: {
          $path: "include",
          node_modules: {
            $className: "Folder",
            "@rbxts": { $path: "node_modules/@rbxts" },
          },
        },
      },
      StarterPlayer: {
        $className: "StarterPlayer",
        StarterPlayerScripts: {
          $className: "StarterPlayerScripts",
          Apps: appSection(apps, "client"),
        },
      },
      ServerScriptService: {
        $className: "ServerScriptService",
        Apps: appSection(apps, "server"),
      },
    },
  };
  fs.writeFileSync(PROJECT_FILE, JSON.stringify(projectJson, null, 2));
  console.log(`✅ Generated ${PROJECT_FILE} for apps: ${apps.join(", ")}`);
}

module.exports = { generateProjectJson };
