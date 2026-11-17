# Aramex (Fastway) plugin for Claude Code

Quote, book, label, track and cancel **Aramex Australia / New Zealand** shipments from Claude Code. Aramex AU/NZ was formerly Fastway Couriers. The plugin includes:

- **MCP server `aramex`** with 9 tools: `aramex_quote`, `aramex_create_consignment`, `aramex_list_consignments`, `aramex_get_consignment`, `aramex_cancel_consignment`, `aramex_get_labels`, `aramex_track`, `aramex_validate_address`, and a raw `aramex_api_request` escape hatch.
- **Skill `aramex-shipping`**: teaches Claude the quote → confirm → book → label workflow and safety rules, such as never booking or cancelling without your confirmation.
- **Slash commands**: `/aramex-track <label…>`, `/aramex-quote <dest> <kg> [dims]`, `/aramex-ship [details]`.

## Setup

### Option 1: Claude desktop app (no terminal)

1. Open the **Code** tab and start a local session.
2. In the prompt box, type `/plugin marketplace add trypractile/aramex-fastway` and press Enter.
3. Click **+** next to the prompt box, then **Add plugins** (or **Plugins → Browse plugins**), choose **aramex-fastway** and click Install.
4. When asked, paste your **Aramex client ID** and **client secret**, and pick the region (`nz` is the default; choose `au` for Australia). The secret is saved in your computer's secure credential store, not in a settings file.
5. Start a new session and try `/aramex-track <label number>`.

To change the key later, type `/plugin configure aramex-fastway@practile-plugins`.

### Option 2: terminal

```bash
claude plugin marketplace add trypractile/aramex-fastway
claude plugin install aramex-fastway@practile-plugins --config aramex_client_id=YOUR_ID --config aramex_client_secret=YOUR_SECRET --config aramex_region=nz
```

### Option 3: Claude cloud sessions (claude.ai/code, or the Cloud option in the desktop app)

Cloud sessions run in a fresh container each time, so the plugin is installed by the environment's setup script rather than by clicking Install.

1. In Claude, open the cloud environment menu (in the session title bar) and create a new environment, for example `aramex-fastway`.
2. **Network access**: keep "limited", and add these allowed hosts:
   ```
   identity.fastway.org
   api.myfastway.com.au
   api.myfastway.co.nz
   ```
3. **Setup script**:
   ```bash
   claude plugin marketplace add trypractile/aramex-fastway || true
   claude plugin marketplace update practile-plugins
   claude plugin install aramex-fastway@practile-plugins
   claude plugin update aramex-fastway@practile-plugins
   ```
   The `update` lines make sure every new session gets the latest version, even if the environment reuses a container that already has an older one.
4. **API key**, using either method:
   - **Recommended:** add a *network secret* for host `identity.fastway.org` of type **username and password**. The username is your Aramex client ID and the password is your client secret. The key is stored encrypted and added to the login request by the network proxy. It never appears in the session.
   - **Or** add environment variables `ARAMEX_CLIENT_ID` and `ARAMEX_CLIENT_SECRET`. Note that these are stored as plain text on the environment.
   - The plugin defaults to New Zealand. For Australian accounts, add the environment variable `ARAMEX_REGION=au`.
5. Start a new session on that environment and ask, for example, "track Aramex label XXXXXXXX".

### Getting an API key

In the MyFastway / Aramex customer portal, create an API key. It gives you a client ID and a client secret. Your account must have API access enabled.

The server is pre-bundled (`server/dist/index.mjs`), so installing it needs no `npm install`. It only needs Node 18 or later.

You can also supply the key as the environment variables `ARAMEX_CLIENT_ID`, `ARAMEX_CLIENT_SECRET` and `ARAMEX_REGION`, which is useful in cloud environments. Values entered at install time take priority.

### Optional settings

| Variable | Default |
|---|---|
| `ARAMEX_REGION` | `nz` (`au` switches base URL and scope) |
| `ARAMEX_API_BASE` | `https://api.myfastway.co.nz` (NZ) / `https://api.myfastway.com.au` (AU) |
| `ARAMEX_TOKEN_URL` | `https://identity.fastway.org/connect/token` |
| `ARAMEX_SCOPE` | `fw-fl2-api-nz` / `fw-fl2-api-au` |
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
