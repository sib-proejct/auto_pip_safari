// Local UI preview only. The fake browser API is never included in extension packages.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../extension");
const mock = `let previewSettings={enabled:true,restoreOnReturn:true,includeMuted:false,delayMs:150,disabledHosts:[]};
globalThis.browser={runtime:{sendMessage:async message=>{
 if(message.type==='popup-state')return {settings:previewSettings,host:'www.youtube.com',frames:[{score:100,pip:false,state:'ready'}]};
 if(message.type==='update-settings'){Object.assign(previewSettings,message.patch);if(message.host)previewSettings.disabledHosts=message.siteEnabled?[]:[message.host];return {settings:previewSettings};}
 return {ok:false,reason:'no-video'};
}}};`;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/preview-api.js") { response.setHeader("Content-Type", "text/javascript"); response.end(mock); return; }
  const filename = path.resolve(root, `.${pathname === "/" ? "/popup.html" : pathname}`);
  if (!filename.startsWith(`${root}/`)) { response.writeHead(403); response.end(); return; }
  try {
    let content = fs.readFileSync(filename);
    if (filename.endsWith("popup.html")) content = content.toString().replace("<head>", '<head><script src="/preview-api.js"></script>');
    response.setHeader("Content-Type", types[path.extname(filename)] || "application/octet-stream");
    response.end(content);
  } catch { response.writeHead(404); response.end(); }
}).listen(4178, "127.0.0.1", () => console.log("UI preview: http://127.0.0.1:4178"));
