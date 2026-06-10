function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getBackendBaseUrl(): string {
  const direct = process.env.BACKEND_INTERNAL_URL;
  if (direct) return stripTrailingSlash(direct);

  const tokenSyncUrl = process.env.TOKEN_SYNC_URL;
  if (tokenSyncUrl) {
    return stripTrailingSlash(tokenSyncUrl.replace(/\/shop-token\/?$/i, ""));
  }

  return "";
}

export function getBackendSecret(): string {
  return process.env.TOKEN_SYNC_SECRET || "";
}

export class BackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

export type BackendRequestOptions = {
  path: string;
  body?: unknown;
  method?: "POST" | "GET";
  acceptStatuses?: number[];
};

export async function callBackend<T = unknown>(options: BackendRequestOptions): Promise<T> {
  const baseUrl = getBackendBaseUrl();
  const secret = getBackendSecret();

  if (!baseUrl) {
    throw new BackendUnavailableError(
      "Backend base URL not configured. Set BACKEND_INTERNAL_URL (or TOKEN_SYNC_URL) on the Shopify app.",
    );
  }
  if (!secret) {
    throw new BackendUnavailableError(
      "Backend shared secret not configured. Set TOKEN_SYNC_SECRET on the Shopify app.",
    );
  }

  const url = `${baseUrl}${options.path}`;
  const response = await fetch(url, {
    method: options.method || "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Token-Sync-Secret": secret,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const accept = options.acceptStatuses ?? [200];
  if (!accept.includes(response.status)) {
    let bodySnippet = "";
    try {
      bodySnippet = (await response.text()).slice(0, 256);
    } catch {
      // ignore body read failures
    }
    throw new Error(
      `Backend call failed: ${options.method || "POST"} ${options.path} status=${response.status} body=${bodySnippet}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
