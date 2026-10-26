const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../extension/pip-core.js");
const settings = require("../extension/shared.js");

class Video extends EventTarget {
  constructor(values = {}) {
    super();
    Object.assign(this, {
      isConnected: true, paused: false, ended: false, readyState: 4,
      videoWidth: 1920, videoHeight: 1080, muted: false, volume: 1,
      webkitPresentationMode: "inline", disabled: false, autoSettle: true, calls: []
    }, values);
  }
  webkitSupportsPresentationMode() { return true; }
  webkitSetPresentationMode(mode) {
    this.calls.push(mode);
    if (!this.disabled && this.autoSettle) this.settle(mode);
  }
  settle(mode) {
    this.webkitPresentationMode = mode;
    this.dispatchEvent(new Event("webkitpresentationmodechanged"));
  }
  getBoundingClientRect() { return { width: 960, height: 540 }; }
}

function fixture(video = new Video(), options = {}) {
  const doc = { hidden: true, pictureInPictureElement: null, pictureInPictureEnabled: true };
  let enabled = true;
  const changes = [];
  const controller = core.createController({ doc, chooseVideo: () => video, isAllowed: () => enabled,
    onChange: state => changes.push(state), timeoutMs: 25, ...options });
  return { video, doc, controller, changes, disable: () => { enabled = false; controller.restore(); } };
}

test("automatically enters and restores only its own PiP", async () => {
  const { video, controller } = fixture();
  assert.equal((await controller.enter()).ok, true);
  assert.equal(controller.getState().owned, true);
  controller.setActive(true);
  assert.deepEqual(video.calls, ["picture-in-picture", "inline"]);
  assert.equal(controller.getState().owned, false);
});

test("manual PiP survives returning to the tab", async () => {
  const { video, controller } = fixture();
  await controller.enter({ automatic: false });
  controller.setActive(true);
  assert.deepEqual(video.calls, ["picture-in-picture"]);
  assert.equal(controller.getState().owned, false);
});

test("an already open native PiP is not acquired or closed", async () => {
  const video = new Video({ webkitPresentationMode: "picture-in-picture" });
  const { controller } = fixture(video);
  assert.equal((await controller.enter()).reason, "no-video");
  controller.setActive(true);
  assert.deepEqual(video.calls, []);
});

test("return during native opening animation exits once opening completes", async () => {
  const video = new Video({ autoSettle: false });
  const { controller } = fixture(video);
  const entry = controller.enter();
  controller.setActive(true);
  video.settle("picture-in-picture");
  assert.equal((await entry).ok, true);
  assert.deepEqual(video.calls, ["picture-in-picture", "inline"]);
});

test("disabling during native opening prevents an orphaned PiP", async () => {
  const video = new Video({ autoSettle: false });
  const { controller, disable } = fixture(video);
  const entry = controller.enter();
  disable();
  video.settle("picture-in-picture");
  await entry;
  assert.equal(video.calls.at(-1), "inline");
});

test("closing PiP manually suppresses reentry until the next visit", async () => {
  const { video, controller } = fixture();
  await controller.enter();
  video.settle("inline");
  assert.equal(controller.getState().suppressed, true);
  assert.equal((await controller.enter()).ok, false);
  controller.setActive(true);
  controller.setActive(false);
  assert.equal((await controller.enter()).ok, true);
});

test("restore preference can leave automatically opened PiP running", async () => {
  const { video, controller } = fixture();
  await controller.enter({ restoreOnReturn: false });
  controller.setActive(true, false);
  assert.deepEqual(video.calls, ["picture-in-picture"]);
});

test("Safari's silent refusal becomes a blocked state", async () => {
  const { controller } = fixture(new Video({ disabled: true }));
  assert.equal((await controller.enter()).reason, "blocked");
  assert.equal(controller.getState().owned, false);
  assert.equal((await controller.enter()).ok, false);
});

test("standard PiP rejection is handled without an unhandled promise", async () => {
  const video = new Video();
  video.webkitSetPresentationMode = undefined;
  video.requestPictureInPicture = () => Promise.reject(new Error("NotAllowedError"));
  const { controller } = fixture(video);
  assert.equal((await controller.enter()).reason, "blocked");
});

test("foreground tab and disabled settings cannot auto-open PiP", async () => {
  const { controller, disable, video } = fixture();
  controller.setActive(true);
  assert.equal((await controller.enter()).ok, false);
  controller.setActive(false);
  disable();
  assert.equal((await controller.enter()).reason, "disabled");
  assert.deepEqual(video.calls, []);
});

test("muted, paused, tiny, full-screen, and opted-out players are excluded", () => {
  const doc = { pictureInPictureEnabled: true };
  const config = settings.normalize();
  for (const values of [{ muted: true }, { paused: true }, { ended: true }, { readyState: 1 },
    { disablePictureInPicture: true }, { webkitPresentationMode: "fullscreen" }, { videoWidth: 0 }]) {
    assert.equal(core.score(new Video(values), config, doc), -1);
  }
  const tiny = new Video();
  tiny.getBoundingClientRect = () => ({ width: 1, height: 1 });
  assert.equal(core.score(tiny, config, doc), -1);
  assert.equal(core.score(new Video(), config, { ...doc, fullscreenElement: {} }), -1);
  assert.equal(core.score(new Video(), config, doc, { display: "none" }), -1);
  assert(core.score(new Video({ muted: true }), { ...config, includeMuted: true }, doc) >= 0);
});

test("settings normalization rejects malformed values and matches exact hosts", () => {
  const config = settings.normalize({ enabled: "yes", delayMs: -1, disabledHosts: ["youtube.com", "youtube.com", 42] });
  assert.equal(config.enabled, true);
  assert.equal(config.delayMs, 150);
  assert.deepEqual(config.disabledHosts, ["youtube.com"]);
  assert.equal(settings.allowed(config, "youtube.com"), false);
  assert.equal(settings.allowed(config, "www.youtube.com"), true);
  assert.equal(settings.hostname("safari-extension://id/page.html"), "");
});
