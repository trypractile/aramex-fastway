// All Aramex (formerly Fastway) API endpoint details live here so they can be
// verified/corrected against the official docs in one place.
//
// Every value can be overridden with environment variables, which lets you
// point at a sandbox or fix a path without rebuilding the plugin.

const REGIONS = {
  au: {
    apiBase: "https://api.myfastway.com.au",
    scope: "fw-fl2-api-au",
  },
  nz: {
    apiBase: "https://api.myfastway.co.nz",
    scope: "fw-fl2-api-nz",
  },
};

// Treat unresolved placeholders like "${user_config.x}" or "${VAR}" as unset.
function val(v) {
  return typeof v === "string" && v.trim() && !/^\$\{.*\}$/.test(v.trim()) ? v.trim() : "";
}

export function loadConfig(rawEnv = process.env) {
  // Values entered in the plugin's install prompt (ARAMEX_CFG_*) win over env vars.
  const env = {};
  for (const [k, v] of Object.entries(rawEnv)) env[k] = val(v);
  for (const k of ["CLIENT_ID", "CLIENT_SECRET", "REGION"]) {
    if (env[`ARAMEX_CFG_${k}`]) env[`ARAMEX_${k}`] = env[`ARAMEX_CFG_${k}`];
  }
  const region = (env.ARAMEX_REGION || "nz").toLowerCase();
  const defaults = REGIONS[region];
  if (!defaults) {
    throw new Error(`ARAMEX_REGION must be "au" or "nz" (got "${env.ARAMEX_REGION}")`);
  }

  return {
    region,
    clientId: env.ARAMEX_CLIENT_ID || "",
    clientSecret: env.ARAMEX_CLIENT_SECRET || "",
    tokenUrl: env.ARAMEX_TOKEN_URL || "https://identity.fastway.org/connect/token",
    scope: env.ARAMEX_SCOPE || defaults.scope,
    apiBase: (env.ARAMEX_API_BASE || defaults.apiBase).replace(/\/+$/, ""),
    labelDir: env.ARAMEX_LABEL_DIR || "",
    timeoutMs: Number(env.ARAMEX_TIMEOUT_MS || 30000),
  };
}

// Endpoint paths (relative to apiBase). Functions take already-encoded params.
export const ENDPOINTS = {
  quote: () => "/api/consignments/quote",
  createConsignment: () => "/api/consignments",
  getConsignment: (id) => `/api/consignments/${id}`,
  cancelConsignment: (id, reasonId) => `/api/consignments/${id}/reason/${reasonId}`,
  labels: (id) => `/api/consignments/${id}/labels`,
  track: (label) => `/api/track/label/${label}`,
  validateAddress: () => "/api/addresses/validate",
};
