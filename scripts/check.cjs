const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../extension");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
const resources = [...manifest.background.scripts, ...manifest.content_scripts.flatMap(item => item.js),
  manifest.action.default_popup, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon),
  "popup.css", "popup.js"];
for (const resource of new Set(resources)) {
  assert(fs.statSync(path.join(root, resource)).isFile(), `Missing ${resource}`);
  if (resource.endsWith(".js")) new vm.Script(fs.readFileSync(path.join(root, resource), "utf8"), { filename: resource });
}
assert.equal(manifest.manifest_version, 3);
assert(!manifest.permissions.includes("scripting"));
console.log(`Manifest and ${new Set(resources).size} resources verified.`);
