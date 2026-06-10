/* ======================================================
   0️⃣ Popup configuration
   Merchant-managed settings saved by the app admin UI into the
   $app.popup_config shop metafield and rendered into the page by
   blocks/star_rating.liquid. Defaults mirror DEFAULT_POPUP_CONFIG in
   app/popup-config.ts — keep both in sync.
====================================================== */
(function readAffiliatePopupConfig() {
  var DEFAULTS = {
    popupEnabled: true,
    returnBannerEnabled: true,
    showDiscountCode: true,
    ctaLabel: "Shop Now",
    typography: { fontFamily: "inherit", headlineSize: 15, bodySize: 13 },
    colors: { background: "#ffffff", text: "", button: "#111111", buttonText: "#ffffff" },
    borderRadius: 16,
  };
  var FONT_STACKS = {
    inherit: "inherit",
    system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  };
  var HEX = /^#[0-9a-fA-F]{6}$/;

  function clamp(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }
  function hex(value, fallback) {
    return typeof value === "string" && HEX.test(value) ? value : fallback;
  }
  function bool(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }

  var raw = null;
  try {
    var el = document.querySelector("script[data-hq-affiliate-config]");
    if (el && el.textContent) raw = JSON.parse(el.textContent);
  } catch (e) {
    raw = null;
  }
  raw = raw && typeof raw === "object" ? raw : {};
  var typography = raw.typography && typeof raw.typography === "object" ? raw.typography : {};
  var colors = raw.colors && typeof raw.colors === "object" ? raw.colors : {};

  window.__HQ_POPUP_CONFIG__ = {
    popupEnabled: bool(raw.popupEnabled, DEFAULTS.popupEnabled),
    returnBannerEnabled: bool(raw.returnBannerEnabled, DEFAULTS.returnBannerEnabled),
    showDiscountCode: bool(raw.showDiscountCode, DEFAULTS.showDiscountCode),
    ctaLabel:
      typeof raw.ctaLabel === "string" && raw.ctaLabel.trim()
        ? raw.ctaLabel.trim().slice(0, 40)
        : DEFAULTS.ctaLabel,
    fontFamily:
      FONT_STACKS[typography.fontFamily] || FONT_STACKS[DEFAULTS.typography.fontFamily],
    headlineSize: clamp(typography.headlineSize, 12, 28, DEFAULTS.typography.headlineSize),
    bodySize: clamp(typography.bodySize, 10, 20, DEFAULTS.typography.bodySize),
    background: hex(colors.background, DEFAULTS.colors.background),
    text: hex(colors.text, ""),
    button: hex(colors.button, DEFAULTS.colors.button),
    buttonText: hex(colors.buttonText, DEFAULTS.colors.buttonText),
    borderRadius: clamp(raw.borderRadius, 0, 32, DEFAULTS.borderRadius),
  };
})();

(function () {
    if (window.__AFFILIATE_EMBED_LOADED__) return;
    window.__AFFILIATE_EMBED_LOADED__ = true;
  
    console.log("✅ Affiliate app embed loaded");
  
    const COOKIE_NAME = "__hqref";
    const SMCHANNEL_COOKIE = "__hqsmchannel";
    const COOKIE_DAYS = 1;
  
    /* ==============================
       Cookie helpers
    ============================== */
    function setCookie(name, value, days) {
      let expires = "";
      if (days) {
        const d = new Date();
        d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
        expires = "; expires=" + d.toUTCString();
      }
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie =
        name +
        "=" +
        encodeURIComponent(value) +
        expires +
        "; path=/; SameSite=Lax" +
        secure;
    }
  
    function getCookie(name) {
      const match = document.cookie.match(
        new RegExp("(^| )" + name + "=([^;]+)")
      );
      return match ? decodeURIComponent(match[2]) : "";
    }
  
    /* ==============================
       1️⃣ Read URL params
    ============================== */
    const params = new URLSearchParams(window.location.search);
    const affiliateIdFromParam = params.get("ref");
    const affiliateName = params.get("rfname");
    const discountPercent = params.get("dispc");
    const discountCode = params.get("discount");
    const smChannelFromParam = params.get("smchannel");

    /* ==============================
       2️⃣ Set cookies (first-touch)
    ============================== */
    const existingCookie = getCookie(COOKIE_NAME);
    if (affiliateIdFromParam && !existingCookie) {
      setCookie(COOKIE_NAME, affiliateIdFromParam, COOKIE_DAYS);
      console.log("✅ Ref cookie set:", affiliateIdFromParam);
    }

    const existingSmChannelCookie = getCookie(SMCHANNEL_COOKIE);
    if (smChannelFromParam && !existingSmChannelCookie) {
      setCookie(SMCHANNEL_COOKIE, smChannelFromParam, COOKIE_DAYS);
      console.log("✅ SM Channel cookie set:", smChannelFromParam);
    }

    /* ==============================
       3️⃣ Persist affiliate + discount to cart
       Uses URL param OR cookie value (for return visitors)
    ============================== */
    // Get affiliate ID from URL param first, fallback to cookie
    const affiliateId = affiliateIdFromParam || getCookie(COOKIE_NAME);
    // Get SM channel from URL param first, fallback to cookie
    const smChannel = smChannelFromParam || getCookie(SMCHANNEL_COOKIE);
    
    persistAffiliateToCart({
      affiliateId,
      affiliateName,
      discountCode,
      discountPercent,
      smChannel
    });

    function persistAffiliateToCart({
      affiliateId,
      affiliateName,
      discountCode,
      discountPercent,
      smChannel
    }) {
      // Persist if we have affiliate ID (from URL or cookie) OR discount code
      if (!affiliateId && !discountCode) return;

      fetch("/cart.js")
        .then((res) => res.json())
        .then((cart) => {
          const attrs = cart.attributes || {};

          // First-touch attribution: never overwrite existing affiliate data
          if (attrs.shop_ref || attrs.affiliate_id) return;

          return fetch("/cart/update.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              attributes: {
                // shop_ref: This is the key that will appear in order webhook note_attributes
                shop_ref: affiliateId || "",
                affiliate_id: affiliateId || "",
                affiliate_name: affiliateName || "",
                affiliate_discount_code: discountCode || "",
                affiliate_discount_percent: discountPercent || "",
                affiliate_sm_channel: smChannel || "",
                affiliate_source: "affiliate_link",
                affiliate_ts: Date.now().toString()
              }
            })
          });
        })
        .catch(() => {});
    }
  })();
  
/* ======================================================
   4️⃣ Affiliate Offer Modal - Gift Experience
   Elegant, personal "gift from a friend" design
====================================================== */
(function affiliateOfferModalFromParams() {
  const SESSION_KEY = "__hq_affiliate_modal_shown";
  const config = window.__HQ_POPUP_CONFIG__ || {};

  // Merchant disabled the popup in the app's settings. Return before the
  // session flag is set so re-enabling shows the popup within the same session.
  if (config.popupEnabled === false) return;

  if (location.pathname.includes("/checkout")) return;
  if (sessionStorage.getItem(SESSION_KEY)) return;

  const params = new URLSearchParams(window.location.search);
  const affiliateId = params.get("ref");
  const affiliateName = params.get("rfname");
  const discountPercent = params.get("dispc");
  const discountCode = params.get("discount");

  if (!affiliateId) return;

  sessionStorage.setItem(SESSION_KEY, "1");

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- Compact Modern Gift Styles ---------- */
  const style = document.createElement("style");
  style.innerHTML = `
    .hq-gift-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 9998;
      animation: hqGiftFadeIn 0.25s ease-out;
    }

    .hq-gift-modal {
      --hq-text: inherit;
      --hq-text-muted: rgba(0, 0, 0, 0.5);
      --hq-bg: #fff;
      --hq-accent: currentColor;

      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--hq-bg);
      padding: 24px 24px 20px;
      border-radius: var(--hq-radius, 16px);
      max-width: 320px;
      width: calc(100% - 32px);
      box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.2);
      z-index: 9999;
      font-family: var(--hq-font, inherit);
      animation: hqGiftAppear 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      text-align: center;
      color: var(--hq-text);
    }

    .hq-gift-close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: transparent;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.15s;
      opacity: 0.4;
      color: inherit;
    }

    .hq-gift-close:hover {
      opacity: 0.7;
    }

    .hq-gift-icon {
      width: 36px;
      height: 36px;
      margin: 0 auto 12px;
      opacity: 0.8;
    }

    .hq-gift-headline {
      margin: 0 0 4px;
      font-size: var(--hq-headline-size, 15px);
      font-weight: 600;
      line-height: 1.4;
      letter-spacing: -0.2px;
    }

    .hq-gift-subtitle {
      margin: 0 0 16px;
      font-size: var(--hq-body-size, 13px);
      opacity: 0.6;
      line-height: 1.4;
    }

    .hq-gift-code-box {
      background: rgba(0, 0, 0, 0.03);
      border: 1px dashed rgba(0, 0, 0, 0.15);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 16px;
    }

    .hq-gift-code-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      opacity: 0.5;
      margin-bottom: 6px;
      font-weight: 600;
    }

    .hq-gift-code-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .hq-gift-code {
      font-size: var(--hq-headline-size, 15px);
      font-weight: 600;
      letter-spacing: 1px;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    .hq-gift-copy-btn {
      background: transparent;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 500;
      opacity: 0.7;
      transition: all 0.15s;
      color: inherit;
      font-family: inherit;
    }

    .hq-gift-copy-btn:hover {
      opacity: 1;
      border-color: rgba(0, 0, 0, 0.25);
    }

    .hq-gift-copy-btn.copied {
      background: #22c55e;
      border-color: #22c55e;
      color: white;
      opacity: 1;
    }

    .hq-gift-copy-icon {
      width: 12px;
      height: 12px;
    }

    .hq-gift-cta {
      background: var(--hq-btn-bg, rgba(0, 0, 0, 0.9));
      color: var(--hq-btn-text, #fff);
      border: none;
      padding: 12px 20px;
      border-radius: min(var(--hq-radius, 16px), 10px);
      font-weight: 500;
      cursor: pointer;
      width: 100%;
      font-size: var(--hq-body-size, 13px);
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-family: inherit;
    }

    .hq-gift-cta:hover {
      filter: brightness(0.92);
    }

    .hq-gift-footer {
      margin-top: 12px;
      font-size: 11px;
      opacity: 0.45;
    }

    .hq-gift-footer strong {
      opacity: 0.8;
      font-weight: 500;
    }

    @keyframes hqGiftFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes hqGiftAppear {
      from { 
        opacity: 0;
        transform: translate(-50%, -48%) scale(0.98);
      }
      to { 
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }
  `;
  document.head.appendChild(style);

  // Build dynamic copy based on available data
  const hasName = affiliateName && affiliateName.trim();
  const hasDiscount = discountPercent && discountPercent.trim();
  const safeName = hasName ? escapeHtml(affiliateName.trim()) : "";
  const safePercent = hasDiscount ? escapeHtml(discountPercent.trim()) : "";
  const safeCode = discountCode ? escapeHtml(discountCode) : "";
  const ctaLabel = escapeHtml(config.ctaLabel || "Shop Now");
  const showCodeBox = config.showDiscountCode !== false && discountCode;

  let headline, subtitle;
  if (hasName && hasDiscount) {
    headline = `${safeName} sent you a gift`;
    subtitle = `${safePercent}% off, just for you`;
  } else if (hasName) {
    headline = `${safeName} sent you a gift`;
    subtitle = `A special discount, just for you`;
  } else if (hasDiscount) {
    headline = `Someone sent you a gift`;
    subtitle = `${safePercent}% off is waiting for you`;
  } else {
    headline = `Someone sent you a gift`;
    subtitle = `A special discount is waiting for you`;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "hq-gift-backdrop";

  const modal = document.createElement("div");
  modal.className = "hq-gift-modal";

  // Merchant-configured styling (see $app.popup_config metafield).
  modal.style.setProperty("--hq-bg", config.background || "#ffffff");
  if (config.text) modal.style.setProperty("--hq-text", config.text);
  modal.style.setProperty(
    "--hq-radius",
    (config.borderRadius != null ? config.borderRadius : 16) + "px",
  );
  modal.style.setProperty("--hq-font", config.fontFamily || "inherit");
  modal.style.setProperty("--hq-headline-size", (config.headlineSize || 15) + "px");
  modal.style.setProperty("--hq-body-size", (config.bodySize || 13) + "px");
  modal.style.setProperty("--hq-btn-bg", config.button || "#111111");
  modal.style.setProperty("--hq-btn-text", config.buttonText || "#ffffff");

  modal.innerHTML = `
    <button class="hq-gift-close" aria-label="Close">
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>
    
    <svg class="hq-gift-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>
    </svg>
    
    <h2 class="hq-gift-headline">${headline}</h2>
    <p class="hq-gift-subtitle">${subtitle}</p>
    
    ${showCodeBox ? `
      <div class="hq-gift-code-box">
        <div class="hq-gift-code-label">Your code</div>
        <div class="hq-gift-code-wrapper">
          <span class="hq-gift-code">${safeCode}</span>
          <button class="hq-gift-copy-btn" id="hq-gift-copy">
            <svg class="hq-gift-copy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            Copy
          </button>
        </div>
      </div>
    ` : ''}
    
    <button class="hq-gift-cta" id="hq-gift-unwrap">
      ${ctaLabel}
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
      </svg>
    </button>

    ${hasName ? `<div class="hq-gift-footer">From <strong>${safeName}</strong></div>` : ''}
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  function close() {
    backdrop.style.animation = 'hqGiftFadeIn 0.2s ease-out reverse forwards';
    modal.style.animation = 'hqGiftAppear 0.2s ease-out reverse forwards';
    setTimeout(() => {
      backdrop.remove();
      modal.remove();
    }, 180);
  }

  backdrop.onclick = close;
  modal.querySelector(".hq-gift-close").onclick = close;

  // Copy gift code functionality
  const copyBtn = modal.querySelector("#hq-gift-copy");
  if (copyBtn && discountCode) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(discountCode);
        copyBtn.classList.add("copied");
        copyBtn.innerHTML = `
          <svg class="hq-gift-copy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          <span>Copied!</span>
        `;
        setTimeout(() => {
          copyBtn.classList.remove("copied");
          copyBtn.innerHTML = `
            <svg class="hq-gift-copy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            <span>Copy</span>
          `;
        }, 2000);
      } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = discountCode;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyBtn.querySelector('span').textContent = 'Copied!';
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.querySelector('span').textContent = 'Copy';
          copyBtn.classList.remove("copied");
        }, 2000);
      }
    };
  }

  // Unwrap gift button
  modal.querySelector("#hq-gift-unwrap").onclick = () => {
    if (discountCode) {
      window.location.href = `/discount/${discountCode}?redirect=/cart`;
    } else {
      close();
    }
  };
})();
  
/* ======================================================
   5️⃣ Return visitor (cookie-only, no params)
   Also ensures cart attributes are set for return visitors
====================================================== */
(function affiliateReturnVisitorReminder() {
  const SESSION_KEY = "__hq_affiliate_return_shown";
  const REF_COOKIE = "__hqref";
  const SMCHANNEL_COOKIE = "__hqsmchannel";
  const config = window.__HQ_POPUP_CONFIG__ || {};

  if (location.pathname.includes("/checkout")) return;

  const hasParams = new URLSearchParams(location.search).has("ref");
  if (hasParams) return;

  // Get cookie value
  function getCookieValue(name) {
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : "";
  }

  const affiliateIdFromCookie = getCookieValue(REF_COOKIE);
  const smChannelFromCookie = getCookieValue(SMCHANNEL_COOKIE);
  if (!affiliateIdFromCookie) return;

  // Ensure cart attributes are set for return visitors
  // This runs on every page load (not just once per session) to catch cases
  // where cart was cleared or visitor returns with a new cart
  (function ensureCartAttributesForReturnVisitor() {
    fetch("/cart.js")
      .then((res) => res.json())
      .then((cart) => {
        const attrs = cart.attributes || {};
        
        // Only set if not already set (first-touch attribution)
        if (attrs.shop_ref || attrs.affiliate_id) return;

        return fetch("/cart/update.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attributes: {
              shop_ref: affiliateIdFromCookie,
              affiliate_id: affiliateIdFromCookie,
              affiliate_sm_channel: smChannelFromCookie || "",
              affiliate_source: "return_visitor",
              affiliate_ts: Date.now().toString()
            }
          })
        });
      })
      .catch(() => {});
  })();

  // Merchant disabled the banner in the app's settings. Cart attribution
  // above still runs — config only governs visible UI.
  if (config.returnBannerEnabled === false) return;

  // Show banner only once per session
  if (sessionStorage.getItem(SESSION_KEY)) return;
  sessionStorage.setItem(SESSION_KEY, "1");

  const banner = document.createElement("div");
  const bannerFont =
    config.fontFamily && config.fontFamily !== "inherit" ? config.fontFamily : "system-ui";
  banner.style = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${config.button || "#111111"};
    color: ${config.buttonText || "#ffffff"};
    padding: 14px 16px;
    border-radius: ${Math.min(config.borderRadius != null ? config.borderRadius : 16, 12)}px;
    z-index: 9999;
    max-width: 280px;
    font-family: ${bannerFont};
    box-shadow: 0 10px 30px rgba(0,0,0,.3);
    font-size: ${(config.bodySize || 13) + 1}px;
  `;

  banner.innerHTML = `
    👋 Welcome back!<br/>
    Your referral discount is still active.
  `;

  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 5000);
})();
  
