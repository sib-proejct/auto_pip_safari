function show(enabled) {
    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function showError() {
    document.getElementById("error").textContent = "Safari 설정 → 확장 프로그램에서 Auto PiP를 직접 켜 주세요.";
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
