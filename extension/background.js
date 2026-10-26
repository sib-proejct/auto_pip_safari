/* global browser, AutoPiPSettings */
"use strict";

const api = browser;
const S = AutoPiPSettings;
const frames = new Map();
const activeTabs = new Map();
const jobs = new Map();
const revisions = new Map();
const suppressedTabs = new Set();
let settings = S.normalize();
let owner = null;
let storageQueue = Promise.resolve();
const ready = api.storage.local.get("settings").then(async result => {
  settings = S.normalize(result.settings);
  // MV3 may unload this background page. Rebuild PiP ownership from live frames.
  const tabs = await api.tabs.query({});
  await Promise.allSettled(tabs.map(tab => api.tabs.sendMessage(tab.id, { type: "refresh" })));
}).catch(() => {});

function invalidate(tabId) {
  revisions.set(tabId, (revisions.get(tabId) || 0) + 1);
  jobs.delete(tabId);
}

async function send(tabId, frameId, message) {
  try { return await api.tabs.sendMessage(tabId, message, { frameId }); }
  catch { return null; }
}

async function contextFor(tabId) {
  try {
    const tab = await api.tabs.get(tabId);
    return { tab, host: S.hostname(tab.url) };
  } catch { return null; }
}

function scheduleEntry(tabId) {
  if (suppressedTabs.has(tabId)) return;
  if (jobs.has(tabId)) return jobs.get(tabId);
  const revision = revisions.get(tabId) || 0;
  const job = (async () => {
    await ready;
    await new Promise(resolve => setTimeout(resolve, settings.delayMs));
    if ((revisions.get(tabId) || 0) !== revision) return;
    const context = await contextFor(tabId);
    if (suppressedTabs.has(tabId) || (revisions.get(tabId) || 0) !== revision) return;
    if (!context || context.tab.active || !S.allowed(settings, context.host)) return;
    // A report from any frame also protects manually opened PiP in another tab.
    if (owner || [...frames.values()].some(tabFrames => [...tabFrames.values()].some(frame => frame.pip))) return;
    const candidates = [...(frames.get(tabId) || new Map()).entries()]
      .filter(([, frame]) => frame.score >= 0 && Date.now() - frame.at < 15000)
      .sort((a, b) => b[1].score - a[1].score);
    if (!candidates.length) return;
    const [frameId, frame] = candidates[0];
    // Reserve before awaiting: two hidden tabs must not replace one another's PiP.
    const reservation = { tabId, frameId, pageId: frame.pageId, confirmed: false };
    owner = reservation;
    const result = await send(tabId, frameId, {
      type: "enter", pageId: frame.pageId, automatic: true,
      restoreOnReturn: settings.restoreOnReturn
    });
    if (owner === reservation) {
      reservation.confirmed = true;
      if (!result?.ok || !result.pip) owner = null;
    }
  })().finally(() => { if (jobs.get(tabId) === job) jobs.delete(tabId); });
  jobs.set(tabId, job);
  return job;
}

async function broadcastSettings() {
  const tabs = await api.tabs.query({});
  // A tab-wide send resolves after just one frame replies. Await every known frame's report.
  await Promise.allSettled(tabs.flatMap(tab => {
    const frameIds = [...(frames.get(tab.id)?.keys() || [0])];
    return frameIds.map(frameId => send(tab.id, frameId, {
      type: "settings", settings, host: S.hostname(tab.url)
    }));
  }));
}

api.runtime.onMessage.addListener((message, sender) => {
  if (sender.tab && message?.type === "hello") {
    return ready.then(async () => {
      const context = await contextFor(sender.tab.id);
      return { settings, host: context?.host || S.hostname(sender.tab.url) };
    });
  }
  if (sender.tab && message?.type === "report") {
    const tabId = sender.tab.id;
    const frameId = sender.frameId ?? 0;
    if (!frames.has(tabId)) frames.set(tabId, new Map());
    const old = frames.get(tabId).get(frameId);
    if (old && old.pageId !== message.pageId && owner?.tabId === tabId && owner.frameId === frameId) owner = null;
    frames.get(tabId).set(frameId, {
      pageId: message.pageId,
      score: Number.isFinite(message.score) ? message.score : -1,
      pip: Boolean(message.pip),
      state: typeof message.state === "string" ? message.state : "ready",
      at: Date.now()
    });
    if (owner?.tabId === tabId && owner.frameId === frameId && owner.pageId === message.pageId
        && owner.confirmed && !message.pip && !message.pending) owner = null;
    if (!message.hidden) suppressedTabs.delete(tabId);
    else if (message.state === "dismissed" && message.suppressed && !suppressedTabs.has(tabId)) {
      suppressedTabs.add(tabId);
      invalidate(tabId);
    }
    if (message.hidden) void scheduleEntry(tabId);
    return Promise.resolve({ ok: true });
  }
  if (sender.tab && message?.type === "goodbye") {
    const tabId = sender.tab.id;
    const frameId = sender.frameId ?? 0;
    if (frames.get(tabId)?.get(frameId)?.pageId === message.pageId) {
      frames.get(tabId).delete(frameId);
      if (owner?.tabId === tabId && owner.frameId === frameId && owner.pageId === message.pageId) owner = null;
    }
    return Promise.resolve({ ok: true });
  }
  // Toolbar requests are accepted only from this extension, never from a website.
  if (sender.tab || sender.id !== api.runtime.id) return;
  if (message?.type === "popup-state") {
    return ready.then(async () => {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      const tabFrames = [...(frames.get(tab?.id)?.values() || [])];
      return { settings, tabId: tab?.id, host: S.hostname(tab?.url), frames: tabFrames };
    });
  }
  if (message?.type === "update-settings") {
    storageQueue = storageQueue.catch(() => {}).then(async () => {
      await ready;
      const next = { ...settings };
      for (const key of ["enabled", "restoreOnReturn", "includeMuted", "delayMs"]) {
        if (Object.hasOwn(message.patch || {}, key)) next[key] = message.patch[key];
      }
      if (typeof message.host === "string" && typeof message.siteEnabled === "boolean") {
        const host = S.hostname(`https://${message.host}`);
        if (host && host === message.host) {
          next.disabledHosts = settings.disabledHosts.filter(value => value !== host);
          if (!message.siteEnabled) next.disabledHosts.push(host);
        }
      }
      const normalized = S.normalize(next);
      await api.storage.local.set({ settings: normalized });
      settings = normalized;
      await broadcastSettings();
      return { settings };
    });
    return storageQueue;
  }
  if (message?.type === "manual-entry") {
    return ready.then(async () => {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (!tab || !S.allowed(settings, S.hostname(tab.url))) return { ok: false, reason: "disabled" };
      const candidates = [...(frames.get(tab.id) || new Map()).entries()].sort((a, b) => b[1].score - a[1].score);
      const candidate = candidates.find(([, frame]) => frame.score >= 0);
      if (!candidate) return { ok: false, reason: "no-video" };
      return await send(tab.id, candidate[0], { type: "enter", pageId: candidate[1].pageId, automatic: false })
        || { ok: false, reason: "unavailable" };
    });
  }
});

api.tabs.onActivated.addListener(({ tabId, windowId }) => {
  invalidate(tabId);
  suppressedTabs.delete(tabId);
  const previous = activeTabs.get(windowId);
  activeTabs.set(windowId, tabId);
  // Content-script visibility reports cover the first switch after a background restart.
  if (previous && previous !== tabId) void scheduleEntry(previous);
  void api.tabs.sendMessage(tabId, { type: "returned" }).catch(() => {});
});

api.tabs.onRemoved.addListener(tabId => {
  invalidate(tabId);
  suppressedTabs.delete(tabId);
  frames.delete(tabId);
  if (owner?.tabId === tabId) owner = null;
  for (const [windowId, id] of activeTabs) if (id === tabId) activeTabs.delete(windowId);
});

api.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading") {
    invalidate(tabId);
    suppressedTabs.delete(tabId);
    frames.delete(tabId);
    if (owner?.tabId === tabId) owner = null;
  }
});

api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  settings = S.normalize(changes.settings.newValue);
  void broadcastSettings();
});
