export default function AdditionalPage() {
  return (
    <s-page heading="Setup Guide">
      <s-section heading="Webhook Forwarding">
        <s-paragraph>
          Configure <code>ORDER_EVENTS_WEBHOOK_FORWARD_URL</code> to forward
          order, refund, and fulfillment events to your backend.
        </s-paragraph>
        <s-paragraph>
          Configure <code>ORDER_CREATE_WEBHOOK_FORWARD_URL</code> when you need
          a separate destination for the <code>orders/create</code> webhook.
        </s-paragraph>
      </s-section>

      <s-section heading="Compliance Webhooks">
        <s-paragraph>
          This app handles required Shopify privacy webhooks:
          <code> customers/data_request</code>, <code>customers/redact</code>,
          and <code>shop/redact</code>.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Shopify References">
        <s-unordered-list>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/launch/app-requirements-checklist"
              target="_blank"
            >
              App requirements checklist
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/store/security/gdpr-webhooks"
              target="_blank"
            >
              GDPR webhook requirements
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
