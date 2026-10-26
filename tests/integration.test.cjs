const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const read = name => fs.readFileSync(path.join(__dirname, "../extension", name), "utf8");

test("background and real content scripts coordinate a tab switch, restore, and site exclusion", async () => {
  function event() {
    const listeners = [];
    return { addListener: fn => listeners.push(fn), async send(...args) {
      const replies = listeners.map(fn => fn(...args)).filter(value => value !== undefined);
      return replies.length ? await replies[0] : undefined;
    } };
  }
  class Video extends EventTarget {
    constructor() {
      super();
      Object.assign(this, { isConnected: true, paused: false, ended: false, readyState: 4,
        videoWidth: 1920, videoHeight: 1080, muted: false, volume: 1,
        webkitPresentationMode: "inline", nodeType: 1 });
    }
    webkitSupportsPresentationMode() { return true; }
    webkitSetPresentationMode(mode) {
      this.webkitPresentationMode = mode;
      this.dispatchEvent(new Event("webkitpresentationmodechanged"));
    }
    getBoundingClientRect() { return { width: 960, height: 540 }; }
  }
  class Document extends EventTarget {
    constructor(video) { super(); Object.assign(this, { nodeType: 9, hidden: false, video }); }
    querySelectorAll(selector) { return this.video && ["video", "*"].includes(selector) ? [this.video] : []; }
  }
  const tabs = new Map([[1, { id: 1, active: true, windowId: 1, url: "https://video.example/watch" }],
    [2, { id: 2, active: false, windowId: 1, url: "https://other.example" }]]);
  const pages = new Map();
  const api = {
    runtime: { id: "integration", onMessage: event() },
    storage: { local: { get: async () => ({ settings: { delayMs: 0 } }), set: async () => {} }, onChanged: event() },
    tabs: {
      query: async query => [...tabs.values()].filter(tab => !query.active || tab.active),
      get: async id => tabs.get(id),
      sendMessage: async (id, message) => pages.get(id)?.send(message),
      onActivated: event(), onRemoved: event(), onUpdated: event()
    }
  };
  const background = vm.createContext({ browser: api, setTimeout, clearTimeout, URL, Date });
  vm.runInContext(read("shared.js"), background);
  vm.runInContext(read("background.js"), background);
  const video = new Video();
  const doc = new Document(video);
  const listeners = event();
  pages.set(1, listeners);
  const content = vm.createContext({
    browser: { runtime: { id: api.runtime.id, onMessage: listeners,
      sendMessage: message => api.runtime.onMessage.send(message, { id: api.runtime.id, tab: tabs.get(1), frameId: 0 }) } },
    document: doc, window: new EventTarget(), MutationObserver: class { observe() {} }, ShadowRoot: class {},
    crypto: { randomUUID }, setTimeout, clearTimeout, setInterval: () => 0, getComputedStyle: () => ({})
  });
  for (const file of ["shared.js", "pip-core.js", "content.js"]) vm.runInContext(read(file), content);
  await tick();
  function changeTab(id) {
    for (const tab of tabs.values()) tab.active = tab.id === id;
    doc.hidden = id !== 1;
    void api.tabs.onActivated.send({ tabId: id, windowId: 1 });
    doc.dispatchEvent(new Event("visibilitychange"));
  }
  changeTab(2);
  await tick();
  assert.equal(video.webkitPresentationMode, "picture-in-picture");
  changeTab(1);
  await tick();
  assert.equal(video.webkitPresentationMode, "inline");
  await api.runtime.onMessage.send({ type: "update-settings", host: "video.example", siteEnabled: false }, { id: api.runtime.id });
  changeTab(2);
  await tick();
  assert.equal(video.webkitPresentationMode, "inline");
});
