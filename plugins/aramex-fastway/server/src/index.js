#!/usr/bin/env node
// MCP server exposing the Aramex (formerly Fastway) AU/NZ shipping API.
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AramexClient, AramexError } from "./client.js";
import { ENDPOINTS, loadConfig } from "./config.js";

const config = loadConfig();
const client = new AramexClient(config);
const enc = encodeURIComponent;

// ---------- shared schemas ----------

const Address = z.object({
  StreetAddress: z.string().describe("Street number and name, e.g. '12 Smith St'"),
  AdditionalDetails: z.string().optional().describe("Unit / level / building"),
  Locality: z.string().describe("Suburb or town"),
  StateOrProvince: z.string().optional().describe("State code, e.g. NSW, VIC (AU)"),
  PostalCode: z.string(),
  Country: z.string().default(config.region.toUpperCase()).describe("ISO country code: AU or NZ"),
});

const Contact = z.object({
  ContactName: z.string().optional(),
  BusinessName: z.string().optional(),
  PhoneNumber: z.string().optional(),
  Email: z.string().optional(),
  Address,
});

const Item = z.object({
  Quantity: z.number().int().positive().default(1),
  Reference: z.string().optional(),
  PackageType: z.enum(["P", "S"]).describe("P = parcel, S = satchel"),
  SatchelSize: z.string().optional().describe("Satchel size code when PackageType is S (e.g. A5, A4, A3, A2)"),
  WeightDead: z.number().positive().optional().describe("Dead weight in kg"),
  Length: z.number().positive().optional().describe("cm"),
  Width: z.number().positive().optional().describe("cm"),
  Height: z.number().positive().optional().describe("cm"),
});

const ShipmentShape = {
  To: Contact.describe("Receiver"),
  From: Contact.optional().describe("Sender. Omit to use the account's default pickup address."),
  Items: z.array(Item).min(1),
  Reference: z.string().optional().describe("Your order / customer reference"),
  Services: z.array(z.record(z.unknown())).optional().describe("Optional extra services as accepted by the API"),
  InstructionsPublic: z.string().optional().describe("Delivery instructions shown on the label"),
  InstructionsPrivate: z.string().optional(),
};

// ---------- helpers ----------

function ok(data) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function fail(err) {
  const lines = [`Error: ${err.message}`];
  if (err instanceof AramexError && err.body !== undefined) {
    lines.push(typeof err.body === "string" ? err.body : JSON.stringify(err.body, null, 2));
  }
  return { isError: true, content: [{ type: "text", text: lines.join("\n") }] };
}

const wrap = (fn) => async (args) => {
  try {
    return ok(await fn(args));
  } catch (err) {
    return fail(err);
  }
};

function stripUndefined(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ---------- server ----------

const server = new McpServer({ name: "aramex-fastway", version: "0.1.0" });

server.registerTool(
  "aramex_quote",
  {
    title: "Get shipping quote",
    description:
      "Price a shipment with Aramex (Fastway) without booking it. Returns available services, prices and ETA.",
    inputSchema: ShipmentShape,
    annotations: { readOnlyHint: true },
  },
  wrap((args) => client.request("POST", ENDPOINTS.quote(), { body: stripUndefined(args) })),
);

server.registerTool(
  "aramex_create_consignment",
  {
    title: "Create consignment",
    description:
      "Book a consignment (creates a real, billable shipment and label numbers). " +
      "Always confirm details with the user first; prefer aramex_quote to check price.",
    inputSchema: ShipmentShape,
    annotations: { destructiveHint: false, idempotentHint: false },
  },
  wrap((args) => client.request("POST", ENDPOINTS.createConsignment(), { body: stripUndefined(args) })),
);

server.registerTool(
  "aramex_get_consignment",
  {
    title: "Get consignment",
    description: "Fetch details of an existing consignment by its consignment ID.",
    inputSchema: { consignmentId: z.union([z.string(), z.number()]) },
    annotations: { readOnlyHint: true },
  },
  wrap(({ consignmentId }) => client.request("GET", ENDPOINTS.getConsignment(enc(consignmentId)))),
);

server.registerTool(
  "aramex_cancel_consignment",
  {
    title: "Cancel consignment",
    description:
      "Delete/cancel a consignment that has not been picked up yet. Irreversible; confirm with the user first.",
    inputSchema: {
      consignmentId: z.union([z.string(), z.number()]),
      reasonId: z.number().int().default(1).describe("Cancellation reason code accepted by the API"),
    },
    annotations: { destructiveHint: true },
  },
  wrap(({ consignmentId, reasonId }) =>
    client.request("DELETE", ENDPOINTS.cancelConsignment(enc(consignmentId), enc(reasonId))),
  ),
);

server.registerTool(
  "aramex_get_labels",
  {
    title: "Download labels",
    description: "Download the shipping label PDF for a consignment and save it to disk. Returns the file path.",
    inputSchema: {
      consignmentId: z.union([z.string(), z.number()]),
      pageSize: z.enum(["4x6", "A4"]).default("4x6"),
      outputDir: z.string().optional().describe("Directory to save into (default: ARAMEX_LABEL_DIR or a temp dir)"),
    },
    annotations: { readOnlyHint: true },
  },
  wrap(async ({ consignmentId, pageSize, outputDir }) => {
    const { bytes, contentType } = await client.request("GET", ENDPOINTS.labels(enc(consignmentId)), {
      query: { pageSize },
      binary: true,
    });
    const dir = resolve(outputDir || config.labelDir || join(tmpdir(), "aramex-labels"));
    await mkdir(dir, { recursive: true });
    const file = join(dir, `aramex-${String(consignmentId).replace(/[^\w-]/g, "_")}-${pageSize}.pdf`);
    await writeFile(file, bytes);
    return { savedTo: file, bytes: bytes.length, contentType };
  }),
);

server.registerTool(
  "aramex_track",
  {
    title: "Track parcel",
    description: "Get tracking events for an Aramex/Fastway label (tracking) number.",
    inputSchema: { labelNumber: z.string().min(4) },
    annotations: { readOnlyHint: true },
  },
  wrap(({ labelNumber }) => client.request("GET", ENDPOINTS.track(enc(labelNumber.trim())))),
);

server.registerTool(
  "aramex_validate_address",
  {
    title: "Validate address",
    description: "Check an address is deliverable and get the normalised form Aramex expects.",
    inputSchema: Address.shape,
    annotations: { readOnlyHint: true },
  },
  wrap((args) => client.request("POST", ENDPOINTS.validateAddress(), { body: stripUndefined(args) })),
);

server.registerTool(
  "aramex_api_request",
  {
    title: "Raw API request",
    description:
      "Escape hatch: call any Aramex API path (e.g. '/api/...') with the authenticated client. " +
      "Use for endpoints not covered by the other tools. Non-GET calls may create or change data.",
    inputSchema: {
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      path: z.string().regex(/^\/api\//, "path must start with /api/"),
      query: z.record(z.union([z.string(), z.number()])).optional(),
      body: z.unknown().optional(),
    },
  },
  wrap(({ method, path, query, body }) => client.request(method, path, { query, body })),
);

await server.connect(new StdioServerTransport());
