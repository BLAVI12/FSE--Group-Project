/** Tink API calls for the bank connection and sync. Secrets stay on the server. */

import type { TinkAccount, TinkTransaction } from "./convert.ts";
import {
  accountsNeedingRelink,
  credentialsToRenew,
  failedLoginsToRemove,
  type TinkProviderConsent,
} from "./consents.ts";

export { accountsNeedingRelink, credentialsToRenew, failedLoginsToRemove };

const API_BASE = "https://api.tink.com";
const LINK_URL = "https://link.tink.com/1.0/transactions/connect-accounts";
// Renews the consent of a bank login Tink already has (Tink docs: "Managing
// consents"). connect-accounts refuses a login Tink knows as a duplicate.
const UPDATE_CONSENT_URL =
  "https://link.tink.com/1.0/transactions/update-consent";

// Tink Link's own client id, fixed by Tink. A delegated grant names it as the
// actor so that Tink Link may add a bank to our permanent user. It is NOT our
// client id. (Tink docs: "Continuous access to a bank account", step 2.2.)
const TINK_LINK_ACTOR_CLIENT_ID = "df05e4b379934cd09963197cc855bfe9";

// What Tink Link needs to add a bank to the user (delegated grant).
const LINK_SCOPES =
  "authorization:read,authorization:grant,credentials:refresh,credentials:read," +
  "credentials:write,providers:read,user:read";

// What our backend needs to read the user's data during a sync.
const DATA_SCOPES =
  "accounts:read,balances:read,transactions:read,provider-consents:read";

// What our backend needs to remove a failed bank login (Tink docs: "Managing
// consents" > "Delete a consent"). Asked for only when it is used.
const CLEANUP_SCOPES = "provider-consents:read,credentials:write";

// 500 pages of 100 is 50,000 transactions, ~14x the Demo Bank history. A
// longer walk means Tink is misbehaving, not that the user is unusually busy.
const MAX_PAGES = 500;

export interface TinkConfig {
  clientId: string;
  clientSecret: string;
  /** Where Tink Link sends the browser back to; must be registered in Tink Console. */
  redirectUri: string;
  market: string;
  locale: string;
  /** Tink Link's test mode, which offers Demo Bank. True for the sandbox. */
  testMode: boolean;
  timeoutMs: number;
}

export interface TinkClientOptions {
  fetch?: typeof fetch;
  /** Clock for the client-token cache; tests move it forward. */
  now?: () => number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CodeResponse {
  code: string;
}

export class TinkError extends Error {
  readonly status: number;
  readonly code: string;
  readonly trackingId: string | undefined;

  constructor(
    message: string,
    status: number,
    code: string,
    trackingId?: string,
  ) {
    super(message);
    this.name = "TinkError";
    this.status = status;
    this.code = code;
    this.trackingId = trackingId;
  }
}

/**
 * Reads the Tink settings from environment variables. `get` is Deno.env.get
 * in an Edge Function, or a lookup in process.env under Node.
 */
export function tinkConfigFromEnv(
  get: (name: string) => string | undefined,
): TinkConfig {
  const required = (name: string): string => {
    const value = get(name);
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };
  const timeoutMs = Number(get("TINK_TIMEOUT_MS") ?? 20_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error("TINK_TIMEOUT_MS must be a positive integer");
  return {
    clientId: required("TINK_CLIENT_ID"),
    clientSecret: required("TINK_CLIENT_SECRET"),
    redirectUri: required("TINK_REDIRECT_URI"),
    market: get("TINK_MARKET") ?? "DE",
    locale: get("TINK_LOCALE") ?? "en_US",
    testMode: (get("TINK_TEST_MODE") ?? "true") !== "false",
    timeoutMs,
  };
}

/**
 * The `sub` claim of a Tink user token (the Tink user id), or null for an
 * opaque token. Decoded only, not verified: the token came straight from Tink
 * over TLS, and the value is stored for reference, never used for access.
 */
export function jwtSubject(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof payload === "object" &&
      payload !== null &&
      "sub" in payload &&
      typeof payload.sub === "string"
    ) {
      return payload.sub;
    }
  } catch {
    // Some OAuth servers use opaque access tokens; that is valid too.
  }
  return null;
}

export type TinkClient = ReturnType<typeof createTinkClient>;

export function createTinkClient(
  config: TinkConfig,
  options: TinkClientOptions = {},
) {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  let cachedClientToken: { token: string; expiresAt: number } | null = null;

  /** fetch with a timeout; network failures and timeouts become TinkErrors. */
  async function tinkFetch(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    try {
      return await fetchFn(`${API_BASE}${path}`, {
        ...init,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new TinkError(
          `Tink did not respond within ${config.timeoutMs / 1000}s`,
          504,
          "TINK_TIMEOUT",
        );
      }
      throw new TinkError("Could not reach Tink", 503, "TINK_UNREACHABLE");
    }
  }

  async function responseJson<T>(response: Response): Promise<T> {
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // handled by the generic error below
    }
    if (!response.ok) {
      const record =
        typeof body === "object" && body !== null
          ? (body as Record<string, unknown>)
          : {};
      const code = String(
        record.error ??
          record.errorCode ??
          record.error_reason ??
          `HTTP_${response.status}`,
      );
      const message = String(
        record.message ??
          record.errorMessage ??
          record.error_description ??
          "Tink request failed",
      );
      const trackingId =
        typeof record.tracking_id === "string" ? record.tracking_id : undefined;
      throw new TinkError(message, response.status, code, trackingId);
    }
    if (body === null)
      throw new TinkError(
        "Tink returned an empty response",
        502,
        "EMPTY_RESPONSE",
      );
    return body as T;
  }

  async function postForm<T>(
    path: string,
    values: Record<string, string>,
    token?: string,
  ): Promise<T> {
    const response = await tinkFetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: new URLSearchParams(values),
    });
    return responseJson<T>(response);
  }

  /** Our application's own token (client credentials), cached until a minute before expiry. */
  async function clientToken(): Promise<string> {
    if (cachedClientToken && cachedClientToken.expiresAt > now() + 60_000)
      return cachedClientToken.token;
    const token = await postForm<TokenResponse>("/api/v1/oauth/token", {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
      scope: "user:create,authorization:grant",
    });
    cachedClientToken = {
      token: token.access_token,
      expiresAt: now() + Number(token.expires_in) * 1000,
    };
    return token.access_token;
  }

  async function createUser(externalUserId: string): Promise<void> {
    const response = await tinkFetch("/api/v1/user/create", {
      method: "POST",
      headers: {
        authorization: `Bearer ${await clientToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        external_user_id: externalUserId,
        market: config.market,
        locale: config.locale,
      }),
    });
    await responseJson<unknown>(response);
  }

  async function delegatedCode(
    externalUserId: string,
    idHint: string,
  ): Promise<string> {
    const response = await postForm<CodeResponse>(
      "/api/v1/oauth/authorization-grant/delegate",
      {
        actor_client_id: TINK_LINK_ACTOR_CLIENT_ID,
        external_user_id: externalUserId,
        id_hint: idHint,
        scope: LINK_SCOPES,
      },
      await clientToken(),
    );
    return response.code;
  }

  async function exchangeAuthorizationCode(
    code: string,
  ): Promise<TokenResponse> {
    return postForm<TokenResponse>("/api/v1/oauth/token", {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
    });
  }

  async function grantUserToken(
    externalUserId: string,
    scope: string,
  ): Promise<string> {
    const { code } = await postForm<CodeResponse>(
      "/api/v1/oauth/authorization-grant",
      { external_user_id: externalUserId, scope },
      await clientToken(),
    );
    return (await exchangeAuthorizationCode(code)).access_token;
  }

  async function getData<T>(path: string, userToken: string): Promise<T> {
    const response = await tinkFetch(path, {
      headers: { authorization: `Bearer ${userToken}` },
    });
    return responseJson<T>(response);
  }

  /** Follows nextPageToken to the end, refusing to loop or run away. */
  async function fetchAllPages<T>(
    path: string,
    key: string,
    userToken: string,
    pageSize?: number,
  ): Promise<T[]> {
    const all: T[] = [];
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;
    for (let page = 1; ; page++) {
      if (page > MAX_PAGES)
        throw new TinkError(
          `Stopped after ${MAX_PAGES} pages of ${path}`,
          502,
          "TOO_MANY_PAGES",
        );
      const query = new URLSearchParams();
      if (pageSize) query.set("pageSize", String(pageSize));
      if (pageToken) query.set("pageToken", pageToken);
      const body = await getData<Record<string, unknown>>(
        query.size ? `${path}?${query}` : path,
        userToken,
      );
      const items = body[key];
      if (!Array.isArray(items))
        throw new TinkError(
          `Tink response has no ${key} list`,
          502,
          "UNEXPECTED_RESPONSE",
        );
      all.push(...(items as T[]));

      const next =
        typeof body.nextPageToken === "string" && body.nextPageToken
          ? body.nextPageToken
          : undefined;
      if (!next) return all;
      if (seenTokens.has(next))
        throw new TinkError(
          `Tink repeated a page token for ${path}`,
          502,
          "PAGE_TOKEN_REPEATED",
        );
      seenTokens.add(next);
      pageToken = next;
    }
  }

  async function fetchProviderConsents(
    userToken: string,
  ): Promise<TinkProviderConsent[]> {
    const body = await getData<{ providerConsents?: unknown }>(
      "/api/v1/provider-consents",
      userToken,
    );
    if (!Array.isArray(body.providerConsents)) {
      throw new TinkError(
        "Tink response has no providerConsents list",
        502,
        "UNEXPECTED_RESPONSE",
      );
    }
    return body.providerConsents as TinkProviderConsent[];
  }

  async function deleteCredentials(
    userToken: string,
    credentialsId: string,
  ): Promise<void> {
    const response = await tinkFetch(
      `/api/v1/credentials/${encodeURIComponent(credentialsId)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${userToken}` },
      },
    );
    if (!response.ok) await responseJson<unknown>(response); // throws a TinkError
  }

  return {
    /**
     * A single-use code that lets Tink Link add a bank to the permanent Tink
     * user identified by `externalUserId` (our user id).
     *
     * The delegated grant is tried first. If Tink rejects it with a 4xx (no
     * such user yet), the user is created and the grant retried. A 409 from
     * create means the user already exists, which is fine. This way the flow
     * never depends on the exact shape of Tink's "already exists" response.
     */
    async tinkLinkCode(
      externalUserId: string,
      idHint: string,
    ): Promise<string> {
      try {
        return await delegatedCode(externalUserId, idHint);
      } catch (error) {
        if (!(error instanceof TinkError) || error.status >= 500) throw error;
        try {
          await createUser(externalUserId);
        } catch (createError) {
          if (!(createError instanceof TinkError && createError.status === 409))
            throw createError;
        }
        return delegatedCode(externalUserId, idHint);
      }
    },

    tinkLinkUrl(authorizationCode: string, state: string): string {
      const url = new URL(LINK_URL);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        authorization_code: authorizationCode,
        market: config.market,
        locale: config.locale,
        ...(config.testMode ? { test: "true" } : {}),
        state,
      }).toString();
      return url.toString();
    },

    /** Tink Link URL that renews the consent of an existing bank login. */
    updateConsentUrl(
      authorizationCode: string,
      credentialsId: string,
      state: string,
    ): string {
      const url = new URL(UPDATE_CONSENT_URL);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        credentials_id: credentialsId,
        authorization_code: authorizationCode,
        market: config.market,
        locale: config.locale,
        state,
      }).toString();
      return url.toString();
    },

    exchangeAuthorizationCode,

    /** A short-lived user token for reading data; kept in memory only (ADR-0008). */
    userAccessToken(externalUserId: string): Promise<string> {
      return grantUserToken(externalUserId, DATA_SCOPES);
    },

    /**
     * Deletes the user's bank logins that failed and never produced an account
     * (see failedLoginsToRemove), so that the same login can be tried again.
     * Returns how many were removed.
     */
    async removeFailedLogins(externalUserId: string): Promise<number> {
      const token = await grantUserToken(externalUserId, CLEANUP_SCOPES);
      const ids = failedLoginsToRemove(await fetchProviderConsents(token));
      for (const id of ids) await deleteCredentials(token, id);
      return ids.length;
    },

    fetchAccounts(userToken: string): Promise<TinkAccount[]> {
      return fetchAllPages<TinkAccount>(
        "/data/v2/accounts",
        "accounts",
        userToken,
      );
    },

    fetchAllTransactions(userToken: string): Promise<TinkTransaction[]> {
      // Tink returns at most 100 transactions per page.
      return fetchAllPages<TinkTransaction>(
        "/data/v2/transactions",
        "transactions",
        userToken,
        100,
      );
    },

    fetchProviderConsents,
  };
}
