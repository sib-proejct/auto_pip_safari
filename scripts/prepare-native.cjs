const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const project = path.join(root, "macos/Auto PiP/Auto PiP.xcodeproj/project.pbxproj");
// Apple's packager can derive the app ID from its display name but leave the
// extension ID based on --bundle-identifier. Keep their prefixes consistent.
const source = fs.readFileSync(project, "utf8");
fs.writeFileSync(project, source.replaceAll('PRODUCT_BUNDLE_IDENTIFIER = "local.autopip.Auto-PiP";',
  "PRODUCT_BUNDLE_IDENTIFIER = local.autopip.safari;"));
const app = path.join(root, "macos/Auto PiP/Auto PiP");
const iconset = path.join(app, "Assets.xcassets/AppIcon.appiconset");
const images = JSON.parse(fs.readFileSync(path.join(iconset, "Contents.json"))).images;
for (const image of images) {
  if (!image.filename) continue;
  const pixels = parseInt(image.size) * parseInt(image.scale);
  fs.copyFileSync(path.join(root, `extension/icons/icon-${pixels}.png`), path.join(iconset, image.filename));
}
fs.copyFileSync(path.join(root, "extension/icons/icon-256.png"), path.join(app, "Resources/Icon.png"));
