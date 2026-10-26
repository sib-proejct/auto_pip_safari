const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../extension/shared.js");
const tick = (ms = 12) => new Promise(resolve => setTimeout(resolve, ms));

function event() {
  const listeners = [];
  return { addListener: fn => listeners.push(fn), emit: (...args) => listeners.map(fn => fn(...args)) };
}

function fixture() {
  const tabs = new Map([
    [1, { id: 1, windowId: 1, active: false, url: "https://www.youtube.com/watch?v=test" }],
    [2, { id: 2, windowId: 1, active: true, url: "https://example.com/" }]
  ]);
  const calls = [];
  const api = {
    runtime: { id: "unit-test", onMessage: event() },
    storage: {
      local: { get: async () => ({ settings: { delayMs: 0 } }), set: async value => { api.saved = value; } },
      onChanged: event()
    },
    tabs: {
      get: async id => tabs.get(id),
      query: async query => [...tabs.values()].filter(tab => !query.active || tab.active),
      sendMessage: async (id, message, options) => { calls.push({ id, message, options }); return { ok: true, pip: true }; },
      onActivated: event(), onRemoved: event(), onUpdated: event()
    }
  };
  const context = vm.createContext({ browser: api, AutoPiPSettings: S, setTimeout, clearTimeout, Date, URL, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/background.js"), "utf8"), context);
  const report = (tabId, frameId, extra = {}) => api.runtime.onMessage.emit({
    type: "report", pageId: `page-${tabId}-${frameId}`, score: 100, state: "ready", pip: false,
    hidden: true, ...extra
  }, { tab: tabs.get(tabId), frameId, id: api.runtime.id });
  const message = value => api.runtime.onMessage.emit(value, { id: api.runtime.id })[0];
  return { api, calls, tabs, report, message, entries: () => calls.filter(call => call.message.type === "enter") };
}

test("chooses the highest-scoring iframe and targets its document", async () => {
  const f = fixture();
  f.report(1, 0, { score: 100 });
  f.report(1, 7, { score: 900 });
  await tick();
  assert.equal(f.entries().length, 1);
  assert.equal(f.entries()[0].options.frameId, 7);
  assert.equal(f.entries()[0].message.pageId, "page-1-7");
});

test("Safari losing focus alone never opens PiP for its still-active tab", async () => {
  const f = fixture();
  f.report(2, 0);
  await tick();
  assert.equal(f.entries().length, 0);
});

test("returning before the entry delay invalidates the old switch", async () => {
  const f = fixture();
  f.report(1, 0);
  f.api.tabs.onActivated.emit({ tabId: 1, windowId: 1 });
  await tick();
  assert.equal(f.entries().length, 0);
});

test("rapid leave-return-leave creates a fresh job for the final switch", async () => {
  const f = fixture();
  f.report(1, 0);
  f.api.tabs.onActivated.emit({ tabId: 1, windowId: 1 });
  f.api.tabs.onActivated.emit({ tabId: 2, windowId: 1 });
  f.report(1, 0);
  await tick();
  assert.equal(f.entries().length, 1);
});

test("a manual PiP in another tab is preserved", async () => {
  const f = fixture();
  f.report(2, 0, { pip: true, hidden: false, score: -1 });
  f.report(1, 0);
  await tick();
  assert.equal(f.entries().length, 0);
});

test("simultaneous hidden tabs reserve one PiP owner", async () => {
  const f = fixture();
  f.tabs.get(2).active = false;
  f.report(1, 0);
  f.report(2, 0);
  await tick();
  assert.equal(f.entries().length, 1);
});

test("closing automatic PiP suppresses all frames until the tab is revisited", async () => {
  const f = fixture();
  f.report(1, 0);
  await tick();
  f.report(1, 0, { score: -1, state: "dismissed", suppressed: true });
  f.report(1, 7, { score: 900 });
  await tick();
  assert.equal(f.entries().length, 1);

  f.api.tabs.onActivated.emit({ tabId: 1, windowId: 1 });
  f.report(1, 0, { score: -1, state: "dismissed", suppressed: false, hidden: false });
  f.api.tabs.onActivated.emit({ tabId: 2, windowId: 1 });
  f.report(1, 7, { score: 900 });
  await tick();
  assert.equal(f.entries().length, 2);
  assert.equal(f.entries()[1].options.frameId, 7);
});

test("navigation clears tab-wide dismissal suppression", async () => {
  const f = fixture();
  f.report(1, 0, { state: "dismissed", suppressed: true });
  f.api.tabs.onUpdated.emit(1, { status: "loading" });
  f.report(1, 0, { pageId: "new-page" });
  await tick();
  assert.equal(f.entries().length, 1);
});

test("settings updates wait for every known iframe to acknowledge", async () => {
  const f = fixture();
  f.report(2, 0, { hidden: false, score: -1 });
  f.report(2, 7, { hidden: false, score: -1 });
  let acknowledgeFrame;
  const delivered = [];
  f.api.tabs.sendMessage = async (id, message, options) => {
    if (id !== 2 || message.type !== "settings") return;
    delivered.push(options?.frameId);
    if (options?.frameId === 7) await new Promise(resolve => { acknowledgeFrame = resolve; });
  };
  let saved = false;
  const save = f.message({ type: "update-settings", patch: { includeMuted: true } }).then(() => { saved = true; });
  await tick();
  assert.deepEqual(delivered, [0, 7]);
  assert.equal(saved, false);
  acknowledgeFrame();
  await save;
  assert.equal(saved, true);
});

test("top-level site exclusion applies to embedded players", async () => {
  const f = fixture();
  await f.message({ type: "update-settings", host: "www.youtube.com", siteEnabled: false });
  f.report(1, 9);
  await tick();
  assert.equal(f.entries().length, 0);
});

test("concurrent settings changes retain both updates", async () => {
  const f = fixture();
  await Promise.all([
    f.message({ type: "update-settings", patch: { includeMuted: true } }),
    f.message({ type: "update-settings", patch: { restoreOnReturn: false } })
  ]);
  assert.equal(f.api.saved.settings.includeMuted, true);
  assert.equal(f.api.saved.settings.restoreOnReturn, false);
});

test("content scripts cannot mutate extension settings", async () => {
  const f = fixture();
  const result = f.api.runtime.onMessage.emit({ type: "update-settings", patch: { enabled: false } },
    { tab: f.tabs.get(1), frameId: 0, id: f.api.runtime.id });
  assert.equal(result[0], undefined);
  assert.equal(f.api.saved, undefined);
});
