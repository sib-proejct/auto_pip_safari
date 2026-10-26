/* global browser, AutoPiPSettings, AutoPiPCore */
(function () {
  "use strict";
  const api = browser;
  const S = AutoPiPSettings;
  const core = AutoPiPCore;
  const pageId = crypto.randomUUID();
  const videos = new Set();
  const observedRoots = new WeakSet();
  let settings = S.normalize({ enabled: false });
  let host = "";
  let reportTimer;
  let lastState = "ready";
  let hint;
  let hintDismissed = false;
  let suspended = false;

  function candidate() {
    let best = null;
    let bestScore = -1;
    for (const video of videos) {
      if (!video.isConnected) { videos.delete(video); continue; }
      const value = core.score(video, settings, document, getComputedStyle(video));
      if (value > bestScore) { best = video; bestScore = value; }
    }
    return { video: best, score: bestScore };
  }

  const controller = core.createController({
    doc: document,
    chooseVideo: () => candidate().video,
    isAllowed: () => S.allowed(settings, host),
    onChange(state) {
      lastState = state;
      report();
      if (state === "blocked") showHint();
      if (state === "automatic" || state === "manual") hint?.remove();
    }
  });

  function report() {
    clearTimeout(reportTimer);
    if (suspended) return Promise.resolve();
    const current = candidate();
    const status = controller.getState();
    return api.runtime.sendMessage({
      type: "report", pageId, score: current.score,
      pip: [...videos].some(video => core.inPip(video, document)),
      hidden: document.hidden, state: lastState, pending: status.pending
    }).catch(() => {});
  }

  function reportSoon() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(report, 120);
  }

  function discover(root) {
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    const found = root.matches?.("video") ? [root] : [];
    found.push(...root.querySelectorAll("video"));
    for (const video of found) {
      if (videos.has(video)) continue;
      videos.add(video);
      controller.watch(video);
      for (const name of ["playing", "pause", "ended", "loadedmetadata", "emptied", "volumechange", "resize",
        "webkitpresentationmodechanged", "enterpictureinpicture", "leavepictureinpicture"]) {
        video.addEventListener(name, reportSoon);
      }
    }
    if (!observedRoots.has(root) && (root === document || root instanceof ShadowRoot)) {
      observedRoots.add(root);
      observer.observe(root, { childList: true, subtree: true });
    }
    const elements = root.nodeType === 1 ? [root, ...root.querySelectorAll("*")] : root.querySelectorAll("*");
    for (const element of elements) if (element.shadowRoot) discover(element.shadowRoot);
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) for (const node of mutation.addedNodes) discover(node);
    reportSoon();
  });

  function showHint() {
    if (document.hidden || hintDismissed || !S.allowed(settings, host) || !document.documentElement) return;
    if (!hint) {
      hint = document.createElement("div");
      const shadow = hint.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = `:host{all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;font:13px -apple-system,BlinkMacSystemFont,sans-serif;color:#f5f7ff}
        .box{max-width:290px;padding:16px;background:#182139;border:1px solid #465374;border-radius:16px;box-shadow:0 8px 40px #0004}
        p{margin:0 0 12px;line-height:1.6}button{font:inherit;border:0;border-radius:8px;padding:9px 12px;cursor:pointer;background:#b9f279;color:#183210}
        .close{margin-left:8px;background:#303b54;color:#fff}button:focus-visible{outline:2px solid #fff;outline-offset:3px}`;
      const box = document.createElement("div");
      box.className = "box";
      box.setAttribute("role", "status");
      const text = document.createElement("p");
      text.textContent = "Safari가 자동 PIP 전환을 허용하지 않았어요. 여기서 먼저 PIP를 열어 보세요.";
      const open = document.createElement("button");
      open.textContent = "PIP 열기";
      open.addEventListener("click", () => {
        void controller.enter({ automatic: false }).then(result => {
          if (!result.ok) text.textContent = "영상의 PIP 버튼을 직접 눌러 주세요. 이 플레이어는 자동 전환이 제한될 수 있어요.";
        });
      });
      const close = document.createElement("button");
      close.textContent = "닫기";
      close.className = "close";
      close.addEventListener("click", () => { hintDismissed = true; hint.remove(); });
      box.append(text, open, close);
      shadow.append(style, box);
    }
    if (!hint.isConnected) document.documentElement.append(hint);
  }

  function applySettings(next, topHost) {
    settings = S.normalize(next);
    host = topHost || "";
    if (!S.allowed(settings, host)) { controller.restore(); hint?.remove(); }
    report();
  }

  api.runtime.onMessage.addListener(message => {
    if (message?.type === "refresh") return report();
    if (message?.type === "settings") { applySettings(message.settings, message.host); return; }
    if (message?.type === "returned") {
      controller.setActive(!document.hidden, settings.restoreOnReturn);
      report();
      return;
    }
    if (message?.type === "enter" && message.pageId === pageId) {
      controller.setActive(!document.hidden, settings.restoreOnReturn);
      return controller.enter({ automatic: message.automatic, restoreOnReturn: settings.restoreOnReturn });
    }
  });

  document.addEventListener("visibilitychange", () => {
    controller.setActive(!document.hidden, settings.restoreOnReturn);
    report();
    if (!document.hidden && lastState === "blocked") showHint();
  });
  window.addEventListener("pageshow", () => {
    suspended = false;
    controller.setActive(!document.hidden, settings.restoreOnReturn);
    void api.runtime.sendMessage({ type: "hello" }).then(result => applySettings(result.settings, result.host)).catch(() => {});
  });
  window.addEventListener("pagehide", () => {
    suspended = true;
    controller.restore();
    void api.runtime.sendMessage({ type: "goodbye", pageId }).catch(() => {});
  });
  discover(document);
  // Catch open shadow roots attached after their host entered the document.
  setInterval(() => {
    if (!document.hidden && settings.enabled) { discover(document); report(); }
  }, 4000);
  void api.runtime.sendMessage({ type: "hello" })
    .then(result => applySettings(result.settings, result.host))
    .catch(() => {});
})();
