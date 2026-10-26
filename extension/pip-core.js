(function (root) {
  "use strict";
  const PIP = "picture-in-picture";

  function inPip(video, doc) {
    return video?.webkitPresentationMode === PIP || doc.pictureInPictureElement === video;
  }

  function supported(video, doc) {
    if (video.disablePictureInPicture || video.webkitCurrentPlaybackTargetIsWireless) return false;
    try {
      if (typeof video.webkitSetPresentationMode === "function"
          && video.webkitSupportsPresentationMode?.(PIP)) return true;
    } catch { /* A player can reject presentation-mode checks before metadata loads. */ }
    return typeof video.requestPictureInPicture === "function" && doc.pictureInPictureEnabled !== false;
  }

  function score(video, settings, doc, style) {
    if (!video.isConnected || video.paused || video.ended || video.readyState < 2
        || !video.videoWidth || !video.videoHeight || !supported(video, doc)
        || inPip(video, doc) || video.webkitPresentationMode === "fullscreen"
        || doc.fullscreenElement || doc.webkitFullscreenElement) return -1;
    const audible = !video.muted && video.volume > 0;
    if (!settings.includeMuted && !audible) return -1;
    if (style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse"
        || style?.opacity === "0") return -1;
    const rect = video.getBoundingClientRect();
    if (rect.width < 96 || rect.height < 54) return -1;
    return (audible ? 100000000 : 0) + Math.min(rect.width * rect.height, 10000000);
  }

  // Own only transitions started here. Native/manual PiP is never automatically closed.
  function createController({ doc, chooseVideo, isAllowed, onChange = () => {}, timeoutMs = 1800 }) {
    let active = !doc.hidden;
    let owned = null;
    let pending = null;
    let suppressed = false;
    let state = "ready";
    const watched = new WeakSet();
    const expectedExits = new WeakSet();

    function publish(next) {
      state = next;
      onChange(next);
    }

    function exit(video) {
      if (!inPip(video, doc)) return;
      expectedExits.add(video);
      try {
        if (video.webkitPresentationMode === PIP && typeof video.webkitSetPresentationMode === "function") {
          video.webkitSetPresentationMode("inline");
        } else if (doc.pictureInPictureElement === video) {
          Promise.resolve(doc.exitPictureInPicture()).catch(() => {
            expectedExits.delete(video);
            publish("exit-blocked");
          });
        }
      } catch {
        expectedExits.delete(video);
        publish("exit-blocked");
      }
    }

    function inspect(video) {
      if (inPip(video, doc)) {
        if (pending?.video === video) {
          const attempt = pending;
          pending = null;
          clearTimeout(attempt.timer);
          if (attempt.automatic) owned = video;
          publish(attempt.automatic ? "automatic" : "manual");
          // The native animation may complete after the user has already returned.
          if (attempt.cancelled || !isAllowed() || (attempt.automatic && active && attempt.restoreOnReturn)) {
            exit(video);
          }
          attempt.resolve({ ok: true, pip: inPip(video, doc) });
        }
        return;
      }
      if (owned === video) {
        owned = null;
        const expected = expectedExits.has(video);
        expectedExits.delete(video);
        if (!expected && !active) suppressed = true;
        publish(expected ? "ready" : "dismissed");
      } else {
        expectedExits.delete(video);
      }
    }

    function watch(video) {
      if (watched.has(video)) return;
      watched.add(video);
      for (const name of ["webkitpresentationmodechanged", "enterpictureinpicture", "leavepictureinpicture"]) {
        video.addEventListener(name, () => inspect(video));
      }
    }

    function enter({ automatic = true, restoreOnReturn = true } = {}) {
      if (!isAllowed()) return Promise.resolve({ ok: false, reason: "disabled" });
      if (automatic && (active || suppressed)) return Promise.resolve({ ok: false, reason: "inactive-required" });
      if (pending || owned) return Promise.resolve({ ok: false, reason: "busy" });
      const video = chooseVideo();
      if (!video || inPip(video, doc)) return Promise.resolve({ ok: false, reason: "no-video" });
      watch(video);
      return new Promise(resolve => {
        const attempt = { video, automatic, restoreOnReturn, cancelled: false, resolve, timer: null };
        pending = attempt;
        publish("opening");
        function fail(reason) {
          if (pending !== attempt) return;
          pending = null;
          clearTimeout(attempt.timer);
          if (automatic && !active) suppressed = true;
          publish(reason);
          resolve({ ok: false, reason });
        }
        attempt.timer = setTimeout(() => {
          inspect(video);
          if (pending === attempt) fail("blocked");
        }, timeoutMs);
        try {
          if (typeof video.webkitSetPresentationMode === "function" && video.webkitSupportsPresentationMode?.(PIP)) {
            video.webkitSetPresentationMode(PIP);
            inspect(video);
          } else {
            Promise.resolve(video.requestPictureInPicture()).then(() => inspect(video), () => fail("blocked"));
          }
        } catch { fail("blocked"); }
      });
    }

    function restore() {
      if (pending?.automatic) pending.cancelled = true;
      if (owned) exit(owned);
    }

    function setActive(value, restoreOnReturn = true) {
      const becameActive = value && !active;
      active = value;
      if (becameActive) {
        suppressed = false;
        if (restoreOnReturn) restore();
      }
    }

    return { enter, restore, setActive, watch, getState: () => ({ state, owned: Boolean(owned), pending: Boolean(pending), suppressed }) };
  }

  root.AutoPiPCore = { inPip, supported, score, createController };
  if (typeof module === "object") module.exports = root.AutoPiPCore;
})(globalThis);
