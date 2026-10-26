/* global browser, AutoPiPSettings */
"use strict";
const api = browser;
const S = AutoPiPSettings;
const element = id => document.getElementById(id);
let current;

function status(text, warning = false) {
  element("status-text").textContent = text;
  document.querySelector(".status").classList.toggle("warning", warning);
}

function render() {
  const { settings, host, frames } = current;
  const enabled = S.allowed(settings, host);
  element("enabled").checked = settings.enabled;
  element("enabled").disabled = false;
  element("enabled-label").textContent = settings.enabled ? "다른 탭으로 이동하면 자동 전환" : "자동 전환을 잠시 쉬고 있어요";
  document.querySelector(".hero").classList.toggle("off", !settings.enabled);
  element("site-enabled").checked = Boolean(host) && !settings.disabledHosts.includes(host);
  element("site-enabled").disabled = !host;
  element("site-host").textContent = host || "일반 웹사이트에서 사용할 수 있어요";
  element("restore").checked = settings.restoreOnReturn;
  element("muted").checked = settings.includeMuted;
  element("delay").value = String(settings.delayMs);
  for (const id of ["restore", "muted", "delay"]) element(id).disabled = false;
  const blocked = frames.some(frame => frame.state === "blocked");
  const hasVideo = frames.some(frame => frame.score >= 0);
  const hasPip = frames.some(frame => frame.pip);
  element("open-pip").disabled = !enabled || !hasVideo || hasPip;
  if (!host) status("영상이 있는 웹사이트를 열어 주세요.");
  else if (!settings.enabled) status("자동 PIP가 꺼져 있어요.");
  else if (!enabled) status("이 사이트는 자동 PIP에서 제외했어요.");
  else if (!frames.length) status("Safari의 웹사이트 접근을 허용한 뒤 페이지를 새로고침해 주세요.", true);
  else if (hasPip) status("PIP로 시청 중이에요.");
  else if (blocked) status("Safari가 전환을 제한했어요. 영상 위의 PIP 열기를 눌러 주세요.", true);
  else if (hasVideo) status("준비됐어요. 다른 탭으로 이동해 보세요.");
  else status("소리 있는 영상을 재생하면 준비돼요.");
}

async function load() {
  current = await api.runtime.sendMessage({ type: "popup-state" });
  render();
}

async function save(message) {
  try {
    await api.runtime.sendMessage({ type: "update-settings", ...message });
    await load();
  } catch { status("설정을 저장하지 못했어요. 다시 시도해 주세요.", true); }
}

for (const [id, key] of [["enabled", "enabled"], ["restore", "restoreOnReturn"], ["muted", "includeMuted"]]) {
  element(id).addEventListener("change", event => { void save({ patch: { [key]: event.target.checked } }); });
}
element("site-enabled").addEventListener("change", event => {
  void save({ host: current.host, siteEnabled: event.target.checked });
});
element("delay").addEventListener("change", event => { void save({ patch: { delayMs: Number(event.target.value) } }); });
element("open-pip").addEventListener("click", async () => {
  element("open-pip").disabled = true;
  try {
    const result = await api.runtime.sendMessage({ type: "manual-entry" });
    if (result.ok) await load();
    else status(result.reason === "blocked" ? "페이지로 돌아가 영상 위의 PIP 열기를 눌러 주세요." : "재생 중인 영상을 찾지 못했어요.", true);
  } catch { status("페이지를 새로고침한 뒤 다시 시도해 주세요.", true); }
});
void load().catch(() => status("확장을 다시 불러온 뒤 사용해 주세요.", true));
