const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const read = name => fs.readFileSync(path.join(__dirname, "../extension", name), "utf8");

function fixture(url = "https://video.example/watch") {
  function event() {
    const listeners = [];
    return { addListener: fn => listeners.push(fn), async send(...args) {
      const replies = listeners.map(fn => fn(...args)).filter(value => value !== undefined);
      return replies.length ? await replies[0] : undefined;
    } };
  }
  class Video extends EventTarget {
    constructor(values) {
      super();
      Object.assign(this, { isConnected: true, paused: false, ended: false, readyState: 4,
        videoWidth: 1920, videoHeight: 1080, muted: false, volume: 1,
        webkitPresentationMode: "inline", nodeType: 1 }, values);
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
  const tabs = new Map([[1, { id: 1, active: true, windowId: 1, url }],
    [2, { id: 2, active: false, windowId: 1, url: "https://other.example" }]]);
  const pages = new Map();
  const api = {
    runtime: { id: "integration", onMessage: event() },
    storage: { local: { get: async () => ({ settings: { delayMs: 0 } }), set: async () => {} }, onChanged: event() },
    tabs: {
      query: async query => [...tabs.values()].filter(tab => !query.active || tab.active),
      get: async id => tabs.get(id),
      sendMessage: async (id, message, options) => {
        if (id !== 1) return;
        const targets = options ? [pages.get(options.frameId)].filter(Boolean) : [...pages.values()];
        const replies = targets.map(page => page.listeners.send(message));
        return replies.length ? await Promise.race(replies) : undefined;
      },
      onActivated: event(), onRemoved: event(), onUpdated: event()
    }
  };
  const background = vm.createContext({ browser: api, setTimeout, clearTimeout, URL, Date });
  vm.runInContext(read("shared.js"), background);
  vm.runInContext(read("background.js"), background);
  function addPage(frameId, values = {}) {
    const video = new Video(values);
    const doc = new Document(video);
    const listeners = event();
    const page = { video, doc, listeners, reportGate: null };
    pages.set(frameId, page);
    const content = vm.createContext({
      browser: { runtime: { id: api.runtime.id, onMessage: listeners,
        sendMessage: async message => {
          if (message.type === "report" && page.reportGate) await page.reportGate;
          return api.runtime.onMessage.send(message, { id: api.runtime.id, tab: tabs.get(1), frameId });
        } } },
      document: doc, window: new EventTarget(), MutationObserver: class { observe() {} }, ShadowRoot: class {},
      // Match an HTTP page: getRandomValues exists, randomUUID does not.
      crypto: { getRandomValues: array => webcrypto.getRandomValues(array) },
      setTimeout, clearTimeout, setInterval: () => 0, getComputedStyle: () => ({})
    });
    for (const file of ["shared.js", "pip-core.js", "content.js"]) vm.runInContext(read(file), content);
    return page;
  }
  function changeTab(id) {
    for (const tab of tabs.values()) tab.active = tab.id === id;
    for (const page of pages.values()) page.doc.hidden = id !== 1;
    void api.tabs.onActivated.send({ tabId: id, windowId: 1 });
    for (const page of pages.values()) page.doc.dispatchEvent(new Event("visibilitychange"));
  }
  const message = value => api.runtime.onMessage.send(value, { id: api.runtime.id });
  return { addPage, changeTab, message };
}

test("background and real content scripts coordinate a tab switch, restore, and site exclusion", async () => {
  const { addPage, changeTab, message } = fixture();
  const { video } = addPage(0);
  await tick();
  changeTab(2);
  await tick();
  assert.equal(video.webkitPresentationMode, "picture-in-picture");
  changeTab(1);
  await tick();
  assert.equal(video.webkitPresentationMode, "inline");
  await message({ type: "update-settings", host: "video.example", siteEnabled: false });
  changeTab(2);
  await tick();
  assert.equal(video.webkitPresentationMode, "inline");
});

test("HTTP pages initialize and coordinate PiP without crypto.randomUUID", async () => {
  const f = fixture("http://video.example/watch");
  const { video } = f.addPage(0);
  f.addPage(7, { paused: true });
  await tick();
  const state = await f.message({ type: "popup-state" });
  assert.equal(state.frames.length, 2);
  assert.equal(new Set(state.frames.map(frame => frame.pageId)).size, 2);
  assert.match(state.frames[0].pageId, /^[a-f0-9]{32}$/);
  f.changeTab(2);
  await tick();
  assert.equal(video.webkitPresentationMode, "picture-in-picture");
  f.changeTab(1);
  assert.equal(video.webkitPresentationMode, "inline");
});

test("closing PiP prevents another iframe from reopening it until a tab revisit", async () => {
  const f = fixture();
  const main = f.addPage(0);
  const embedded = f.addPage(7, { paused: true });
  await tick();
  f.changeTab(2);
  await tick();
  assert.equal(main.video.webkitPresentationMode, "picture-in-picture");
  main.video.webkitSetPresentationMode("inline");
  main.video.paused = true;
  main.video.dispatchEvent(new Event("pause"));
  embedded.video.paused = false;
  embedded.video.dispatchEvent(new Event("playing"));
  await tick(180);
  assert.equal(embedded.video.webkitPresentationMode, "inline");

  f.changeTab(1);
  await tick();
  f.changeTab(2);
  await tick();
  assert.equal(embedded.video.webkitPresentationMode, "picture-in-picture");
  f.changeTab(1);
});

test("popup reloads muted iframe eligibility after its settings report completes", async () => {
  const f = fixture();
  f.addPage(0, { paused: true });
  const embedded = f.addPage(7, { muted: true });
  await tick();
  const elements = new Map();
  for (const id of ["status-text", "enabled", "enabled-label", "site-enabled", "site-host", "restore", "muted", "delay", "open-pip"]) {
    const element = { handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; } };
    elements.set(id, element);
  }
  const popup = vm.createContext({
    browser: { runtime: { sendMessage: f.message } },
    document: { getElementById: id => elements.get(id), querySelector: () => ({ classList: { toggle() {} } }) }
  });
  for (const file of ["shared.js", "popup.js"]) vm.runInContext(read(file), popup);
  await tick();
  const button = elements.get("open-pip");
  assert.equal(button.disabled, true);

  let releaseReport;
  embedded.reportGate = new Promise(resolve => { releaseReport = resolve; });
  const muted = elements.get("muted");
  muted.checked = true;
  muted.handlers.change({ target: muted });
  await tick();
  assert.equal(button.disabled, true);
  releaseReport();
  await tick();
  assert.equal(button.disabled, false);
  assert.match(elements.get("status-text").textContent, /준비됐어요/);
  await button.handlers.click();
  assert.equal(embedded.video.webkitPresentationMode, "picture-in-picture");
});
