import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("install-prompt values win over env vars", () => {
  const c = loadConfig({ ARAMEX_CLIENT_ID: "env-id", ARAMEX_CFG_CLIENT_ID: "cfg-id", ARAMEX_CFG_REGION: "au" });
  assert.equal(c.clientId, "cfg-id");
  assert.equal(c.region, "au");
  assert.equal(c.scope, "fw-fl2-api-au");
});

test("unresolved placeholders fall back to env vars / defaults", () => {
  const c = loadConfig({
    ARAMEX_CLIENT_ID: "env-id",
    ARAMEX_CFG_CLIENT_ID: "${user_config.aramex_client_id}",
    ARAMEX_CFG_REGION: "${user_config.aramex_region}",
    ARAMEX_API_BASE: "${ARAMEX_API_BASE}",
  });
  assert.equal(c.clientId, "env-id");
  assert.equal(c.region, "nz");
  assert.equal(c.apiBase, "https://api.myfastway.co.nz");
});
