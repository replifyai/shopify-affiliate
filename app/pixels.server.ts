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
  status: "already_connected" | "created" | "failed";
  webPixelId?: string;
  step?: "query" | "create";
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

function hasNoWebPixelMessage(errors: unknown): boolean {
  const graphqlErrors = asGraphqlErrors(errors);
  return graphqlErrors.some((error) =>
    (error.message || "")
      .toLowerCase()
      .includes("no web pixel was found for this app"),
  );
}

function hasAlreadyExistsMessage(errors: unknown): boolean {
  const graphqlErrors = asGraphqlErrors(errors);
  return graphqlErrors.some((error) =>
    /(already exists|only one web pixel)/i.test(error.message || ""),
  );
}

async function shopifyGraphql(
  session: OfflineSession,
  apiVersion: string,
  query: string,
  variables: Record<string, unknown> = {},
) : Promise<GraphqlResult> {
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

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

export async function ensureWebPixelConnected(
  session: OfflineSession,
  apiVersion: string,
) : Promise<EnsureWebPixelResult> {
  try {
    console.log(`[pixel-bootstrap] Ensuring web pixel for ${session.shop}`);
    const accountID = process.env.PIXEL_ACCOUNT_ID || session.shop;
    const createResponse = await shopifyGraphql(
      session,
      apiVersion,
      WEB_PIXEL_CREATE_MUTATION,
      {
        webPixel: {
          settings: JSON.stringify({ accountID }),
        },
      },
    );

    const createBody = createResponse.body as
      | {
          data?: { webPixelCreate?: { webPixel?: { id?: string }; userErrors?: Array<{ field?: string[]; message?: string }> } };
          errors?: unknown;
        }
      | undefined;
    const userErrors = createBody?.data?.webPixelCreate?.userErrors as
      | Array<{ field?: string[]; message?: string }>
      | undefined;
    const webPixelId = createBody?.data?.webPixelCreate?.webPixel?.id as
      | string
      | undefined;

    if (!createResponse.ok) {
      const result: EnsureWebPixelResult = {
        status: "failed",
        step: "create",
        httpStatus: createResponse.status,
        errors: createResponse.body,
      };
      console.error(`Web pixel create failed for ${session.shop}:`, result);
      return result;
    }

    if (createBody?.errors && hasAlreadyExistsMessage(createBody.errors)) {
      console.log(`Web pixel already connected for ${session.shop}`);
      return { status: "already_connected" };
    }

    if (createBody?.errors) {
      const result: EnsureWebPixelResult = {
        status: "failed",
        step: "create",
        errors: createBody.errors,
      };
      console.error(`Web pixel create error for ${session.shop}:`, result);
      return result;
    }

    if (userErrors?.length && hasAlreadyExistsMessage(userErrors)) {
      console.log(`Web pixel already connected for ${session.shop}`);
      return { status: "already_connected" };
    }

    if (userErrors?.length) {
      const result: EnsureWebPixelResult = {
        status: "failed",
        step: "create",
        userErrors,
      };
      console.error(`Web pixel connect user error for ${session.shop}:`, result);
      return result;
    }

    if (webPixelId) {
      console.log(`Web pixel connected for ${session.shop} (${webPixelId})`);
      return { status: "created", webPixelId };
    }

    const existingPixelResponse = await shopifyGraphql(
      session,
      apiVersion,
      WEB_PIXEL_QUERY,
    );
    const existingBody = existingPixelResponse.body as
      | { data?: { webPixel?: { id?: string } }; errors?: unknown }
      | undefined;
    const existingPixelId = existingBody?.data?.webPixel?.id as
      | string
      | undefined;

    if (existingPixelId) {
      console.log(
        `Web pixel already connected for ${session.shop} (${existingPixelId})`,
      );
      return { status: "already_connected", webPixelId: existingPixelId };
    }

    const result: EnsureWebPixelResult = {
      status: "failed",
      step: "create",
      errors: createResponse.body,
    };
    console.error(
      `Web pixel connect returned no id for ${session.shop}:`,
      result,
    );
    return result;
  } catch (error) {
    const result: EnsureWebPixelResult = {
      status: "failed",
      errors: String(error),
    };
    console.error(`Web pixel connect exception for ${session.shop}:`, result);
    return result;
  }
}
