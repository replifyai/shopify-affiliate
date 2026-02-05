(function () {
    if (window.__AFFILIATE_EMBED_LOADED__) return;
    window.__AFFILIATE_EMBED_LOADED__ = true;
  
    console.log("✅ Affiliate app embed loaded");
  
    const COOKIE_NAME = "__hqref";
    const COOKIE_DAYS = 1;
    const REF_PARAM = "ref";
  
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

    /* ==============================
       2️⃣ Set ref cookie (first-touch)
    ============================== */
    const existingCookie = getCookie(COOKIE_NAME);
    if (affiliateIdFromParam && !existingCookie) {
      setCookie(COOKIE_NAME, affiliateIdFromParam, COOKIE_DAYS);
      console.log("✅ Ref cookie set:", affiliateIdFromParam);
    }

    /* ==============================
       3️⃣ Persist affiliate + discount to cart
       Uses URL param OR cookie value (for return visitors)
    ============================== */
    // Get affiliate ID from URL param first, fallback to cookie
    const affiliateId = affiliateIdFromParam || getCookie(COOKIE_NAME);
    
    persistAffiliateToCart({
      affiliateId,
      affiliateName,
      discountCode,
      discountPercent
    });

    function persistAffiliateToCart({
      affiliateId,
      affiliateName,
      discountCode,
      discountPercent
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

  if (location.pathname.includes("/checkout")) return;
  if (sessionStorage.getItem(SESSION_KEY)) return;

  const params = new URLSearchParams(window.location.search);
  const affiliateId = params.get("ref");
  const affiliateName = params.get("rfname");
  const discountPercent = params.get("dispc");
  const discountCode = params.get("discount");

  if (!affiliateId) return;

  sessionStorage.setItem(SESSION_KEY, "1");

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
      border-radius: 16px;
      max-width: 320px;
      width: calc(100% - 32px);
      box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.2);
      z-index: 9999;
      font-family: inherit;
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
      font-size: 15px;
      font-weight: 600;
      line-height: 1.4;
      letter-spacing: -0.2px;
    }

    .hq-gift-subtitle {
      margin: 0 0 16px;
      font-size: 13px;
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
      font-size: 15px;
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
      background: rgba(0, 0, 0, 0.9);
      color: #fff;
      border: none;
      padding: 12px 20px;
      border-radius: 10px;
      font-weight: 500;
      cursor: pointer;
      width: 100%;
      font-size: 13px;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-family: inherit;
    }

    .hq-gift-cta:hover {
      background: rgba(0, 0, 0, 1);
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
  
  let headline, subtitle;
  if (hasName && hasDiscount) {
    headline = `${affiliateName} sent you a gift`;
    subtitle = `${discountPercent}% off, just for you`;
  } else if (hasName) {
    headline = `${affiliateName} sent you a gift`;
    subtitle = `A special discount, just for you`;
  } else if (hasDiscount) {
    headline = `Someone sent you a gift`;
    subtitle = `${discountPercent}% off is waiting for you`;
  } else {
    headline = `Someone sent you a gift`;
    subtitle = `A special discount is waiting for you`;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "hq-gift-backdrop";

  const modal = document.createElement("div");
  modal.className = "hq-gift-modal";
  
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
    
    ${discountCode ? `
      <div class="hq-gift-code-box">
        <div class="hq-gift-code-label">Your code</div>
        <div class="hq-gift-code-wrapper">
          <span class="hq-gift-code">${discountCode}</span>
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
      Shop Now
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
      </svg>
    </button>
    
    ${hasName ? `<div class="hq-gift-footer">From <strong>${affiliateName}</strong></div>` : ''}
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

  if (location.pathname.includes("/checkout")) return;

  const hasParams = new URLSearchParams(location.search).has("ref");
  if (hasParams) return;

  // Get cookie value
  function getCookieValue(name) {
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : "";
  }

  const affiliateIdFromCookie = getCookieValue(REF_COOKIE);
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
              affiliate_source: "return_visitor",
              affiliate_ts: Date.now().toString()
            }
          })
        });
      })
      .catch(() => {});
  })();

  // Show banner only once per session
  if (sessionStorage.getItem(SESSION_KEY)) return;
  sessionStorage.setItem(SESSION_KEY, "1");

  const banner = document.createElement("div");
  banner.style = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #111;
    color: #fff;
    padding: 14px 16px;
    border-radius: 12px;
    z-index: 9999;
    max-width: 280px;
    font-family: system-ui;
    box-shadow: 0 10px 30px rgba(0,0,0,.3);
    font-size: 14px;
  `;

  banner.innerHTML = `
    👋 Welcome back!<br/>
    Your referral discount is still active.
  `;

  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 5000);
})();
  