// lib/createApp.js
const fs = require("fs");
const { join, dirname } = require("path");
const { spawnSync } = require("node:child_process");
const { generateProjectJson } = require("./generateProject");

function w(file, content = "") {
  fs.mkdirSync(dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

exports.run = (name) => {
  if (!name) {
    console.error("Usage: chisel create-app <name>");
    process.exit(1);
  }
  const base = join(process.cwd(), "src", "apps", name);
  if (fs.existsSync(base)) {
    console.error(`App "${name}" exists.`);
    process.exit(1);
  }

  // server
  w(join(base, "server", "services", "index.ts"), "");

  // shared
  w(
    join(base, "shared", "schemas.ts"),
    `import { t } from "@rbxts/t";
export const PingOut = t.interface({ ok: t.boolean });
`
  );
  w(join(base, "shared", "models.ts"), "\n");

  // client
  w(join(base, "client", "ui", "hydrate.ts"), "// mount UI and import ../gen for calls\n");
  w(join(base, "client", "components", "index.client.ts"), "// register tag components here\n");
  w(join(base, "client", "gen", ".gitkeep"), "");

  generateProjectJson();
  console.log("✔ created app", name);

  // Run local CLI bin (don't rely on global PATH)
  const selfBin = join(__dirname, "..", "bin", "cli.js");
  spawnSync(process.execPath, [selfBin, "build"], { stdio: "inherit" });
};
