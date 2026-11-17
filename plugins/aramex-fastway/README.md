# Aramex (Fastway) plugin for Claude Code

Quote, book, label, track and cancel **Aramex Australia / New Zealand** shipments from Claude Code. Aramex AU/NZ was formerly Fastway Couriers. The plugin includes:

- **MCP server `aramex`** with 8 tools: `aramex_quote`, `aramex_create_consignment`, `aramex_get_consignment`, `aramex_cancel_consignment`, `aramex_get_labels`, `aramex_track`, `aramex_validate_address`, and a raw `aramex_api_request` escape hatch.
- **Skill `aramex-shipping`**: teaches Claude the quote → confirm → book → label workflow and safety rules, such as never booking or cancelling without your confirmation.
- **Slash commands**: `/aramex-track <label…>`, `/aramex-quote <dest> <kg> [dims]`, `/aramex-ship [details]`.

## Setup

1. In the MyFastway / Aramex customer portal, create an API key (client ID and secret).
2. Export the credentials in the shell that launches Claude Code, or add them to the `env` block of `~/.claude/settings.json`:

   ```bash
   export ARAMEX_CLIENT_ID=...
   export ARAMEX_CLIENT_SECRET=...
   export ARAMEX_REGION=au   # or nz
   ```

3. Install the plugin:

   ```bash
   claude plugin marketplace add trypractile/aramex-fastway
   claude plugin install aramex-fastway@practile-plugins
   ```

The server is pre-bundled (`server/dist/index.mjs`), so installing it needs no `npm install`. It only needs Node 18 or later.

### Optional settings

| Variable | Default |
|---|---|
| `ARAMEX_REGION` | `au` (`nz` switches base URL and scope) |
| `ARAMEX_API_BASE` | `https://api.myfastway.com.au` (AU) / `https://api.myfastway.co.nz` (NZ) |
| `ARAMEX_TOKEN_URL` | `https://identity.fastway.org/connect/token` |
| `ARAMEX_SCOPE` | `fw-fl2-api-au` / `fw-fl2-api-nz` |
| `ARAMEX_LABEL_DIR` | OS temp dir + `/aramex-labels` |
| `ARAMEX_TIMEOUT_MS` | `30000` |

## Verifying against the official API

All endpoint paths are in [`server/src/config.js`](server/src/config.js). Check them against your account's API docs, then rebuild:

```bash
cd server && npm install && npm run build && npm test
```

`npm test` runs the bundled server over stdio against a local mock API.

## Development

```
plugins/aramex-fastway/
├── .claude-plugin/plugin.json
├── .mcp.json                 # starts server/dist/index.mjs
├── commands/                 # /aramex-track, /aramex-quote, /aramex-ship
├── skills/aramex-shipping/   # workflow + safety guidance
└── server/
    ├── src/{config,client,index}.js
    ├── dist/index.mjs        # committed bundle (esbuild)
    └── test/e2e.test.js
```

Not affiliated with or endorsed by Aramex.
