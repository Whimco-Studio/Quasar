#!/usr/bin/env node
"use strict";
const { join } = require("path");

function cmd(name) {
  return require(join(__dirname, "..", "lib", name + ".js"));
}
const [, , sub = "help", ...rest] = process.argv;

const map = {
  init: () => require("../lib/init.js").run?.() ?? require("../lib/init.js").initChisel?.(),
  "create-app": () => require("../lib/createApp.js").run?.(rest[0]) ?? require("../lib/createApp.js").createApp?.(rest[0]),
  "generate-project": () => require("../lib/generateProject.js").run?.() ?? require("../lib/generateProject.js").generateProjectJson?.(),
  watch: () => require("../lib/watch.js").run(),
  build: () => require("../lib/build.js").run(),
  help: () => console.log(`chisel <command>
  init                 scaffold config/tsconfig hooks
  create-app <name>    scaffold self-contained app
  generate-project     write default.project.json
  watch                chokidar watch -> codegen -> rbxtsc
  build                one-shot codegen -> rbxtsc`)
};

if (!map[sub]) map.help(); else map[sub]();

