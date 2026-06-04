type OfflineSession = {
  shop: string;
  accessToken: string;
};

type GraphqlResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

export type EnsureWebPixelResult = {
  status: "already_connected" | "created" | "updated" | "failed";
  webPixelId?: string;
  step?: "query" | "create" | "update";
  httpStatus?: number;
  userErrors?: Array<{ field?: string[]; message?: string }>;
  errors?: unknown;
};

type GraphqlError = {
  message?: string;
};

const WEB_PIXEL_QUERY = `#graphql
  query GetWebPixel {
    webPixel {
      id
      settings
    }
  }
`;

const WEB_PIXEL_CREATE_MUTATION = `#graphql
  mutation CreateWebPixel($webPixel: WebPixelInput!) {
    webPixelCreate(webPixel: $webPixel) {
      webPixel {
        id
        settings
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const WEB_PIXEL_UPDATE_MUTATION = `#graphql
  mutation UpdateWebPixel($id: ID!, $webPixel: WebPixelInput!) {
    webPixelUpdate(id: $id, webPixel: $webPixel) {
      webPixel {
        id
        settings
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function asGraphqlErrors(errors: unknown): GraphqlError[] {
  return Array.isArray(errors) ? (errors as GraphqlError[]) : [];
}

function hasAlreadyExistsMessage(errors: unknown): boolean {
  return asGraphqlErrors(errors).some((error) =>
    /already exists|only one web pixel|already been set|update mutation/i.test(
      error.message || "",
    ),
  );
}

async function shopifyGraphql(
  session: OfflineSession,
  apiVersion: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphqlResult> {
  const response = await fetch(
    `https://${session.shop}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { ok: response.ok, status: response.status, body };
}

function buildPixelSettings(session: OfflineSession) {
  const accountID = process.env.PIXEL_ACCOUNT_ID || session.shop;
  const endpointUrl =
    process.env.PIXEL_ENDPOINT_URL ||
    (process.env.SHOPIFY_APP_URL
      ? `${process.env.SHOPIFY_APP_URL.replace(/\/$/, "")}/api/pixel/track`
      : "");

  return JSON.stringify({ accountID, endpointUrl });
}

function settingsMatch(existing: unknown, desired: string) {
  if (typeof existing !== "string") return false;
  try {
    return JSON.stringify(JSON.parse(existing)) === JSON.stringify(JSON.parse(desired));
  } catch {
    return existing === desired;
  }
}

export async function ensureWebPixelConnected(
  session: OfflineSession,
  apiVersion: string,
): Promise<EnsureWebPixelResult> {
  try {
    const desiredSettings = buildPixelSettings(session);
    console.log(`[pixel] ensuring web pixel for ${session.shop}`);

    const existing = await shopifyGraphql(session, apiVersion, WEB_PIXEL_QUERY);
    const existingBody = existing.body as
      | { data?: { webPixel?: { id?: string; settings?: unknown } } }
      | undefined;
    const existingId = existingBody?.data?.webPixel?.id;
    const existingSettings = existingBody?.data?.webPixel?.settings;

    if (existingId) {
      if (settingsMatch(existingSettings, desiredSettings)) {
        return { status: "already_connected", webPixelId: existingId };
      }

      const update = await shopifyGraphql(
        session,
        apiVersion,
        WEB_PIXEL_UPDATE_MUTATION,
        { id: existingId, webPixel: { settings: desiredSettings } },
      );
      const updateBody = update.body as
        | {
            data?: {
              webPixelUpdate?: {
                webPixel?: { id?: string };
                userErrors?: Array<{ field?: string[]; message?: string }>;
              };
            };
          }
        | undefined;
      const updateErrors = updateBody?.data?.webPixelUpdate?.userErrors;
      if (updateErrors?.length) {
        return {
          status: "failed",
          step: "update",
          userErrors: updateErrors,
          webPixelId: existingId,
        };
      }
      return { status: "updated", webPixelId: existingId };
    }

    const created = await shopifyGraphql(
      session,
      apiVersion,
      WEB_PIXEL_CREATE_MUTATION,
      { webPixel: { settings: desiredSettings } },
    );

    const createBody = created.body as
      | {
          data?: {
            webPixelCreate?: {
              webPixel?: { id?: string };
              userErrors?: Array<{ field?: string[]; message?: string }>;
            };
          };
          errors?: unknown;
        }
      | undefined;
    const userErrors = createBody?.data?.webPixelCreate?.userErrors;
    const webPixelId = createBody?.data?.webPixelCreate?.webPixel?.id;

    if (!created.ok) {
      return {
        status: "failed",
        step: "create",
        httpStatus: created.status,
        errors: created.body,
      };
    }

    if (
      hasAlreadyExistsMessage(createBody?.errors) ||
      (userErrors && hasAlreadyExistsMessage(userErrors))
    ) {
      const refetch = await shopifyGraphql(session, apiVersion, WEB_PIXEL_QUERY);
      const refetchBody = refetch.body as
        | { data?: { webPixel?: { id?: string } } }
        | undefined;
      return {
        status: "already_connected",
        webPixelId: refetchBody?.data?.webPixel?.id,
      };
    }

    if (userErrors?.length) {
      return { status: "failed", step: "create", userErrors };
    }

    if (webPixelId) {
      return { status: "created", webPixelId };
    }

    return { status: "failed", step: "create", errors: created.body };
  } catch (error) {
    console.error(`[pixel] connect exception for ${session.shop}:`, error);
    return { status: "failed", errors: String(error) };
  }
}
