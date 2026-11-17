// End-to-end test: runs the bundled MCP server against a local mock Aramex API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../dist/index.mjs", import.meta.url));

test("without a local key, token request uses a placeholder Basic header", async () => {
  const seen = [];
  const http = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    seen.push({ url: req.url, auth: req.headers.authorization, body });
    if (req.url === "/token") return res.end(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
    res.end(JSON.stringify({ data: { ok: true }, errors: [] }));
  });
  await new Promise((r) => http.listen(0, r));
  const base = `http://127.0.0.1:${http.address().port}`;
  const env = { ...process.env, ARAMEX_TOKEN_URL: `${base}/token`, ARAMEX_API_BASE: base };
  delete env.ARAMEX_CLIENT_ID;
  delete env.ARAMEX_CLIENT_SECRET;
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [serverPath], env }));
  try {
    const r = await client.callTool({ name: "aramex_track", arguments: { labelNumber: "ABC123456" } });
    assert.ok(!r.isError, r.content[0].text);
    const tok = seen.find((s) => s.url === "/token");
    assert.match(tok.auth, /^Basic /);
    assert.doesNotMatch(tok.body, /client_secret/);
  } finally {
    await client.close();
    http.close();
  }
});

test("tools work against mock API", async () => {
  const calls = [];
  const http = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
    if (req.url === "/token") {
      assert.match(body, /grant_type=client_credentials/);
      assert.match(body, /scope=fw-fl2-api-nz/);
      res.end(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
    } else if (req.url.startsWith("/api/track/label/")) {
      res.end(JSON.stringify({ data: { status: "Delivered" }, errors: [] }));
    } else if (req.url === "/api/consignments/quote") {
      res.end(JSON.stringify({ data: { total: 12.5 }, errors: [] }));
    } else if (req.url.startsWith("/api/consignments/42/labels")) {
      res.setHeader("content-type", "application/pdf");
      res.end("%PDF-1.4 fake");
    } else if (req.url === "/api/consignments/99") {
      res.statusCode = 404;
      res.end(JSON.stringify({ errors: [{ message: "not found" }] }));
    } else {
      res.statusCode = 500;
      res.end("unexpected");
    }
  });
  await new Promise((r) => http.listen(0, r));
  const base = `http://127.0.0.1:${http.address().port}`;

  const client = new Client({ name: "test", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      env: {
        ...process.env,
        ARAMEX_CLIENT_ID: "id",
        ARAMEX_CLIENT_SECRET: "secret",
        ARAMEX_TOKEN_URL: `${base}/token`,
        ARAMEX_API_BASE: base,
      },
    }),
  );

  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      "aramex_api_request", "aramex_cancel_consignment", "aramex_create_consignment",
      "aramex_get_consignment", "aramex_get_labels", "aramex_quote", "aramex_track",
      "aramex_validate_address",
    ]);

    const track = await client.callTool({ name: "aramex_track", arguments: { labelNumber: "ABC123456" } });
    assert.ok(!track.isError);
    assert.deepEqual(JSON.parse(track.content[0].text), { status: "Delivered" });

    const quote = await client.callTool({
      name: "aramex_quote",
      arguments: {
        To: { Address: { StreetAddress: "1 Test St", Locality: "Sydney", StateOrProvince: "NSW", PostalCode: "2000" } },
        Items: [{ PackageType: "P", WeightDead: 2, Length: 20, Width: 20, Height: 10 }],
      },
    });
    assert.ok(!quote.isError, quote.content[0].text);
    const sent = JSON.parse(calls.find((c) => c.url === "/api/consignments/quote").body);
    assert.equal(sent.To.Address.Country, "NZ");
    assert.equal(sent.Items[0].Quantity, 1);

    const labels = await client.callTool({ name: "aramex_get_labels", arguments: { consignmentId: 42 } });
    const { savedTo } = JSON.parse(labels.content[0].text);
    assert.equal(await readFile(savedTo, "utf8"), "%PDF-1.4 fake");

    const missing = await client.callTool({ name: "aramex_get_consignment", arguments: { consignmentId: 99 } });
    assert.ok(missing.isError);
    assert.match(missing.content[0].text, /404/);

    // Token fetched once and reused.
    assert.equal(calls.filter((c) => c.url === "/token").length, 1);
    assert.ok(calls.filter((c) => c.url !== "/token").every((c) => c.auth === "Bearer tok"));
  } finally {
    await client.close();
    http.close();
  }
});
