(function (root) {
  "use strict";
  const defaults = Object.freeze({
    enabled: true,
    restoreOnReturn: true,
    includeMuted: false,
    delayMs: 150,
    disabledHosts: []
  });

  function normalize(value = {}) {
    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
      restoreOnReturn: typeof value.restoreOnReturn === "boolean" ? value.restoreOnReturn : defaults.restoreOnReturn,
      includeMuted: typeof value.includeMuted === "boolean" ? value.includeMuted : defaults.includeMuted,
      delayMs: [0, 150, 400, 800].includes(value.delayMs) ? value.delayMs : defaults.delayMs,
      disabledHosts: Array.isArray(value.disabledHosts)
        ? [...new Set(value.disabledHosts.filter(host => typeof host === "string" && host.length < 254))]
        : []
    };
  }

  function hostname(url) {
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.hostname.toLowerCase() : "";
    } catch { return ""; }
  }

  function allowed(settings, host) {
    return settings.enabled && Boolean(host) && !settings.disabledHosts.includes(host);
  }

  root.AutoPiPSettings = { defaults, normalize, hostname, allowed };
  if (typeof module === "object") module.exports = root.AutoPiPSettings;
})(globalThis);
