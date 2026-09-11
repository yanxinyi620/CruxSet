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
    const error = new Error(response.status === 401 || response.status === 403 ? `${message} 请先登录。` : message);
    error.loginPath = response.status === 401 || response.status === 403 ? loginPath : undefined;
    throw error;
  }

  function report(error, target) {
    const message = error instanceof Error ? error.message : "请求失败";
    const escaped = String(message).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
    if (target) target.innerHTML = `${escaped}${error.loginPath ? ` <a href="${loginPath}">前往登录</a>` : ""}`;
  }

  window.Lab = { config: { ...configured, mode: cloud ? "cloud" : "local", apiBase, labPath, loginPath }, api, result, calibration, request, report };
})();
