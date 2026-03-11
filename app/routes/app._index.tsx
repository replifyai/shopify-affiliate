import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return {
    shop: session.shop,
    scopes: session.scope || "",
  };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const scopes = data.scopes
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return (
    <s-page heading="Affiliate Dashboard">
      <s-section heading="Connected Shop">
        <s-paragraph>{data.shop}</s-paragraph>
      </s-section>

      <s-section heading="Installed Access Scopes">
        {scopes.length > 0 ? (
          <s-unordered-list>
            {scopes.map((scope) => (
              <s-list-item key={scope}>{scope}</s-list-item>
            ))}
          </s-unordered-list>
        ) : (
          <s-paragraph>No access scopes were reported in this session.</s-paragraph>
        )}
      </s-section>

      <s-section heading="Operational Checks">
        <s-paragraph>
          Review webhook delivery and pixel connection status in{" "}
          <s-link href="/app/integration-status">Integration status</s-link>.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
