import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  DEFAULT_POPUP_CONFIG,
  FONT_FAMILY_CSS,
  FONT_FAMILY_OPTIONS,
  POPUP_CONFIG_LIMITS,
  normalizePopupConfig,
  popupConfigFromFormData,
  type PopupConfig,
} from "../popup-config";

const POPUP_CONFIG_QUERY = `#graphql
  query PopupConfig {
    shop {
      id
      popupConfig: metafield(key: "popup_config") {
        jsonValue
      }
    }
  }
`;

const POPUP_CONFIG_MUTATION = `#graphql
  mutation SavePopupConfig($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function fetchShopPopupConfig(request: Request) {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(POPUP_CONFIG_QUERY);
  const payload = (await response.json()) as {
    data?: { shop?: { id?: string; popupConfig?: { jsonValue?: unknown } | null } };
  };
  return {
    admin,
    shopId: payload?.data?.shop?.id || "",
    config: normalizePopupConfig(payload?.data?.shop?.popupConfig?.jsonValue),
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { config } = await fetchShopPopupConfig(request);
  return { config };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shopId } = await fetchShopPopupConfig(request);
  if (!shopId) {
    return { ok: false as const, error: "Could not resolve the shop. Try reloading the page." };
  }

  const config = popupConfigFromFormData(await request.formData());
  const response = await admin.graphql(POPUP_CONFIG_MUTATION, {
    variables: {
      metafields: [
        {
          ownerId: shopId,
          key: "popup_config",
          type: "json",
          value: JSON.stringify(config),
        },
      ],
    },
  });
  const payload = (await response.json()) as {
    data?: { metafieldsSet?: { userErrors?: Array<{ message?: string }> } };
  };
  const userErrors = payload?.data?.metafieldsSet?.userErrors || [];
  if (userErrors.length > 0) {
    return { ok: false as const, error: userErrors.map((e) => e.message).join("; ") };
  }

  return { ok: true as const };
};

function PopupPreview({ config }: { config: PopupConfig }) {
  const fontFamily = FONT_FAMILY_CSS[config.typography.fontFamily];
  return (
    <div
      style={{
        background: "#f1f1f3",
        borderRadius: 12,
        padding: "40px 24px",
        display: "flex",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {!config.popupEnabled ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            fontSize: 11,
            fontWeight: 600,
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 6,
            padding: "4px 8px",
            zIndex: 1,
          }}
        >
          Popup disabled — hidden on the storefront
        </div>
      ) : null}
      <div
        style={{
          background: config.colors.background,
          color: config.colors.text || "#111111",
          borderRadius: config.borderRadius,
          fontFamily: fontFamily === "inherit" ? undefined : fontFamily,
          maxWidth: 320,
          width: "100%",
          padding: "24px 24px 20px",
          textAlign: "center",
          boxShadow: "0 16px 40px -8px rgba(0, 0, 0, 0.2)",
          opacity: config.popupEnabled ? 1 : 0.35,
        }}
      >
        <div
          style={{
            fontSize: config.typography.headlineSize,
            fontWeight: 600,
            letterSpacing: "-0.2px",
            lineHeight: 1.4,
          }}
        >
          Alex sent you a gift
        </div>
        <p
          style={{
            margin: "4px 0 16px",
            fontSize: config.typography.bodySize,
            opacity: 0.6,
            lineHeight: 1.4,
          }}
        >
          10% off, just for you
        </p>
        {config.showDiscountCode ? (
          <div
            style={{
              background: "rgba(0, 0, 0, 0.03)",
              border: "1px dashed rgba(0, 0, 0, 0.15)",
              borderRadius: Math.min(config.borderRadius, 10),
              padding: 12,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.8px",
                opacity: 0.5,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Your code
            </div>
            <div
              style={{
                fontSize: config.typography.headlineSize,
                fontWeight: 600,
                letterSpacing: "1px",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
              }}
            >
              WELCOME10
            </div>
          </div>
        ) : null}
        <div
          style={{
            background: config.colors.button,
            color: config.colors.buttonText,
            borderRadius: Math.min(config.borderRadius, 10),
            padding: "12px 20px",
            fontWeight: 500,
            fontSize: config.typography.bodySize,
          }}
        >
          {config.ctaLabel}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, opacity: 0.45 }}>
          From <strong style={{ fontWeight: 500 }}>Alex</strong>
        </div>
      </div>
    </div>
  );
}

export default function PopupSettings() {
  const { config: savedConfig } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const submitting = navigation.state === "submitting";

  const [preview, setPreview] = useState<PopupConfig>(savedConfig);
  const [textColorMode, setTextColorMode] = useState(
    savedConfig.colors.text ? "custom" : "inherit",
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Polaris web components are form-associated custom elements; React 18
  // cannot bind their events, so listen natively and rebuild the preview
  // from the live FormData on every change.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const update = () => {
      const formData = new FormData(form);
      setTextColorMode(String(formData.get("textColorMode") || "inherit"));
      setPreview(popupConfigFromFormData(formData));
    };
    form.addEventListener("change", update);
    form.addEventListener("input", update);
    return () => {
      form.removeEventListener("change", update);
      form.removeEventListener("input", update);
    };
  }, []);

  // When the custom text color field mounts/unmounts no event fires;
  // recompute the preview so it picks up the field's value.
  useEffect(() => {
    const form = formRef.current;
    if (form) setPreview(popupConfigFromFormData(new FormData(form)));
  }, [textColorMode]);

  useEffect(() => {
    setPreview(savedConfig);
    setTextColorMode(savedConfig.colors.text ? "custom" : "inherit");
  }, [savedConfig]);

  useEffect(() => {
    if (actionData?.ok) {
      shopify.toast.show("Popup settings saved");
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="Storefront popup">
      <Form method="post" ref={formRef}>
        <s-section heading="Visibility">
          <s-paragraph>
            Control which affiliate UI elements appear on the storefront. Tracking (cookies and
            cart attribution) keeps working even when the popup is hidden.
          </s-paragraph>
          <s-stack gap="base">
            <s-switch
              label="Show the affiliate gift popup"
              details="Shown once per session when a visitor arrives through an affiliate link."
              name="popupEnabled"
              value="on"
              checked={savedConfig.popupEnabled}
            />
            <s-switch
              label="Show the returning-visitor banner"
              details="Small reminder that the referral discount is still active."
              name="returnBannerEnabled"
              value="on"
              checked={savedConfig.returnBannerEnabled}
            />
            <s-switch
              label="Show the discount code inside the popup"
              name="showDiscountCode"
              value="on"
              checked={savedConfig.showDiscountCode}
            />
          </s-stack>
        </s-section>

        <s-section heading="Typography">
          <s-stack gap="base">
            <s-select label="Font family" name="fontFamily" value={savedConfig.typography.fontFamily}>
              {FONT_FAMILY_OPTIONS.map((option) => (
                <s-option key={option.value} value={option.value}>
                  {option.label}
                </s-option>
              ))}
            </s-select>
            <s-number-field
              label="Headline size (px)"
              name="headlineSize"
              min={POPUP_CONFIG_LIMITS.headlineSize.min}
              max={POPUP_CONFIG_LIMITS.headlineSize.max}
              value={String(savedConfig.typography.headlineSize)}
            />
            <s-number-field
              label="Body text size (px)"
              name="bodySize"
              min={POPUP_CONFIG_LIMITS.bodySize.min}
              max={POPUP_CONFIG_LIMITS.bodySize.max}
              value={String(savedConfig.typography.bodySize)}
            />
          </s-stack>
        </s-section>

        <s-section heading="Appearance">
          <s-stack gap="base">
            <s-color-field
              label="Background color"
              name="backgroundColor"
              value={savedConfig.colors.background}
            />
            <s-select
              label="Text color"
              name="textColorMode"
              value={savedConfig.colors.text ? "custom" : "inherit"}
            >
              <s-option value="inherit">Inherit from theme</s-option>
              <s-option value="custom">Custom color</s-option>
            </s-select>
            {textColorMode === "custom" ? (
              <s-color-field
                label="Custom text color"
                name="textColor"
                value={preview.colors.text || "#111111"}
              />
            ) : null}
            <s-color-field
              label="Button color"
              name="buttonColor"
              value={savedConfig.colors.button}
            />
            <s-color-field
              label="Button text color"
              name="buttonTextColor"
              value={savedConfig.colors.buttonText}
            />
            <s-number-field
              label="Corner radius (px)"
              name="borderRadius"
              min={POPUP_CONFIG_LIMITS.borderRadius.min}
              max={POPUP_CONFIG_LIMITS.borderRadius.max}
              value={String(savedConfig.borderRadius)}
            />
          </s-stack>
        </s-section>

        <s-section heading="Call to action">
          <s-text-field
            label="Button label"
            name="ctaLabel"
            maxLength={POPUP_CONFIG_LIMITS.ctaLabelMaxLength}
            value={savedConfig.ctaLabel}
            placeholder={DEFAULT_POPUP_CONFIG.ctaLabel}
          />
        </s-section>

        <s-section heading="Live preview">
          <s-paragraph>
            Sample popup with your current settings. Saved changes apply to the storefront on the
            next page load.
          </s-paragraph>
          <PopupPreview config={preview} />
        </s-section>

        <s-section>
          <s-button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Saving…" : "Save settings"}
          </s-button>
        </s-section>
      </Form>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
