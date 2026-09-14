(() => {
  const configured = window.SEGMENTATION_LAB_CONFIG || {};
  const cloud = configured.mode === "cloud";
  const trim = (value) => String(value || "").replace(/\/+$/, "");
  const apiBase = trim(configured.apiBase || (cloud ? "/api/v1/segmentation-lab" : "/api"));
  const labPath = configured.labPath || (cloud ? "/segmentation-lab/" : "/");
  const api = (suffix = "") => `${apiBase}/${String(suffix).replace(/^\/+/, "")}`.replace(/\/$/, suffix ? "" : "/");
  const result = (id) => `${labPath.replace(/\/$/, "")}/results/${encodeURIComponent(id)}`;
  const calibration = (query = "") => `${labPath.replace(/\/$/, "")}/calibrations${query ? `?${query}` : ""}`;
  const loginPath = configured.loginPath || "/me";

  let authorizationFailed = false;
  const resumePollers = new Set();

  async function request(suffix, init = {}) {
    let response;
    try {
      response = await fetch(api(suffix), { credentials: "include", ...init });
    } catch {
      throw new Error("无法连接分割服务，请稍后重试。 ");
    }
    if (response.ok) return response;
    let body = {};
    try { body = await response.clone().json(); } catch {}
    const message = body.message || body.detail || body.error?.message || "请求失败";
    const error = new Error(response.status === 401 ? `${message} 请先登录。` : message);
    error.status = response.status;
    if (response.status === 401 || response.status === 403) authorizationFailed = true;
    error.loginPath = response.status === 401 ? loginPath : undefined;
    throw error;
  }

  function report(error, target) {
    const message = error instanceof Error ? error.message : "请求失败";
    const escaped = String(message).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
    if (target) target.innerHTML = `${escaped}${error.loginPath ? ` <a href="${loginPath}">前往登录</a>` : ""}`;
  }

  // Schedule after completion: slow requests never overlap. Explicit refreshes
  // during a read are coalesced into one follow-up so mutations are not lost.
  function createPoller(run, onError = () => {}, paused = () => false) {
    let timer, busy = false, queued = false, failures = 0;
    function schedule(delay, explicit = false) {
      clearTimeout(timer);
      if (!document.hidden && !authorizationFailed) timer = setTimeout(() => refresh(explicit), delay);
    }
    resumePollers.add(() => schedule(0));
    async function refresh(explicit = true) {
      clearTimeout(timer);
      if ((!explicit && authorizationFailed) || document.hidden) return;
      if (busy) { queued = queued || explicit; return; }
      if (!explicit && paused()) { schedule(1000); return; }
      busy = true;
      const retryingAuthorization = authorizationFailed;
      let delay = 60000;
      try {
        delay = await run();
        if (retryingAuthorization) {
          authorizationFailed = false;
          resumePollers.forEach(resume => resume());
        }
        failures = 0;
      } catch (error) {
        if (error.status === 401 || error.status === 403) authorizationFailed = true;
        delay = Math.min(120000, 10000 * 2 ** Math.min(failures++, 4));
        queued = false;
        onError(error);
      } finally {
        busy = false;
        const again = queued;
        queued = false;
        schedule(again ? 0 : delay, again);
      }
    }
    document.addEventListener("visibilitychange", () => {
      clearTimeout(timer);
      if (!document.hidden) void refresh(false);
    });
    return { refresh };
  }

  window.Lab = { config: { ...configured, mode: cloud ? "cloud" : "local", apiBase, labPath, loginPath }, api, result, calibration, request, report, createPoller };
})();
