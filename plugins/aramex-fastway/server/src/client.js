// Minimal Aramex API client: OAuth2 client-credentials token caching plus a
// JSON/PDF request helper. Uses Node's built-in fetch (Node 18+).

export class AramexError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "AramexError";
    this.status = status;
    this.body = body;
  }
}

export class AramexClient {
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config;
    this.fetch = fetchImpl;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async getToken() {
    // Refresh 60s early to avoid using a token that expires mid-request.
    if (this.token && Date.now() < this.tokenExpiresAt - 60_000) return this.token;

    const hasCreds = Boolean(this.config.clientId && this.config.clientSecret);
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    const body = new URLSearchParams({ grant_type: "client_credentials", scope: this.config.scope });
    if (hasCreds) {
      body.set("client_id", this.config.clientId);
      body.set("client_secret", this.config.clientSecret);
    } else {
      // No key configured locally: send a placeholder Basic header. In Claude cloud
      // environments a network secret saved for identity.fastway.org (username =
      // client ID, password = secret) replaces it, so the key never sits in env vars.
      headers.Authorization = `Basic ${Buffer.from("placeholder:placeholder").toString("base64")}`;
    }

    const res = await this.fetch(this.config.tokenUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      const hint = hasCreds
        ? ""
        : " No Aramex API key is configured. Enter it when installing the plugin " +
          "(/plugin configure aramex-fastway@practile-plugins), set ARAMEX_CLIENT_ID and " +
          "ARAMEX_CLIENT_SECRET, or in a Claude cloud environment save it as a network " +
          "secret for identity.fastway.org.";
      throw new AramexError(`Token request failed (${res.status}).${hint}`, { status: res.status, body: text });
    }
    const json = JSON.parse(text);
    this.token = json.access_token;
    this.tokenExpiresAt = Date.now() + (Number(json.expires_in) || 3600) * 1000;
    return this.token;
  }

  /**
   * @param {string} method
   * @param {string} path  path relative to apiBase, e.g. "/api/consignments"
   * @param {{ body?: unknown, query?: Record<string, string|number|undefined>, binary?: boolean }} [opts]
   */
  async request(method, path, { body, query, binary = false } = {}) {
    const token = await this.getToken();
    const url = new URL(this.config.apiBase + path);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }

    const headers = { Authorization: `Bearer ${token}`, Accept: binary ? "application/pdf" : "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await this.fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (res.status === 401) {
      // Token may have been revoked; drop it so the next call refetches.
      this.token = null;
    }

    if (binary && res.ok) {
      return { contentType: res.headers.get("content-type") || "", bytes: Buffer.from(await res.arrayBuffer()) };
    }

    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      throw new AramexError(`${method} ${path} failed (${res.status})`, { status: res.status, body: parsed });
    }
    // The API wraps responses as { data, errors }. Surface errors even on 200.
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.errors) && parsed.errors.length) {
      throw new AramexError(`${method} ${path} returned errors`, { status: res.status, body: parsed });
    }
    return parsed && typeof parsed === "object" && "data" in parsed ? parsed.data : parsed;
  }
}
