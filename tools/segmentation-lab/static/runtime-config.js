window.SEGMENTATION_LAB_CONFIG = window.SEGMENTATION_LAB_CONFIG || {
  mode: "local",
  apiBase: "/api",
  homePath: "/",
  labPath: "/",
  loginPath: "/me",
  models: ["sam2", "sam2_tiled", "sam3"],
  publishTargets: ["web", "cloudbase", "cloudflare"],
};
