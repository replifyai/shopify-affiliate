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
    const affiliateId = params.get("ref");
    const affiliateName = params.get("rfname");
    const discountPercent = params.get("dispc");
    const discountCode = params.get("discount");
  
    /* ==============================
       2️⃣ Set ref cookie (first-touch)
    ============================== */
    const existing = getCookie(COOKIE_NAME);
    if (affiliateId && !existing) {
      setCookie(COOKIE_NAME, affiliateId, COOKIE_DAYS);
      console.log("✅ Ref cookie set:", affiliateId);
    }
  
    /* ==============================
       3️⃣ Persist affiliate + discount to cart
    ============================== */
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
      if (!affiliateId && !discountCode) return;
  
      fetch("/cart.js")
        .then((res) => res.json())
        .then((cart) => {
          const attrs = cart.attributes || {};
  
          // First-touch attribution: never overwrite
          if (attrs.affiliate_id) return;
  
          return fetch("/cart/update.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              attributes: {
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
     4️⃣ Affiliate Offer Modal (URL param based)
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
  
    /* ---------- Styles ---------- */
    const style = document.createElement("style");
    style.innerHTML = `
      .hq-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.55);
        z-index: 9998;
      }
      .hq-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #fff;
        padding: 28px;
        border-radius: 16px;
        max-width: 420px;
        width: calc(100% - 40px);
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        z-index: 9999;
        font-family: system-ui, -apple-system;
        animation: scaleIn 0.35s ease-out;
      }
      .hq-modal h2 {
        margin: 0 0 8px;
        font-size: 22px;
      }
      .hq-modal p {
        margin: 0 0 18px;
        font-size: 15px;
        line-height: 1.5;
      }
      .hq-modal button {
        background: #111;
        color: #fff;
        border: none;
        padding: 12px 18px;
        border-radius: 10px;
        font-weight: 600;
        cursor: pointer;
        width: 100%;
        font-size: 15px;
      }
      .hq-close {
        position: absolute;
        top: 14px;
        right: 16px;
        cursor: pointer;
        opacity: 0.6;
      }
      @keyframes scaleIn {
        from { transform: translate(-50%, -50%) scale(0.96); opacity: 0; }
        to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  
    const backdrop = document.createElement("div");
    backdrop.className = "hq-modal-backdrop";
  
    const modal = document.createElement("div");
    modal.className = "hq-modal";
    modal.innerHTML = `
      <div class="hq-close">✕</div>
      <h2>🎉 ${discountPercent ? `${discountPercent}% OFF unlocked!` : "Special Offer Unlocked!"}</h2>
      <p>
        ${affiliateName ? `Referred by <strong>${affiliateName}</strong>.` : ""}
        ${discountCode ? `<br/>Discount code <strong>${discountCode}</strong> is ready to apply.` : ""}
      </p>
      <button id="hq-apply-discount">Apply offer & continue</button>
    `;
  
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  
    function close() {
      backdrop.remove();
      modal.remove();
    }
  
    backdrop.onclick = close;
    modal.querySelector(".hq-close").onclick = close;
  
    modal.querySelector("#hq-apply-discount").onclick = () => {
      if (discountCode) {
        window.location.href = `/discount/${discountCode}?redirect=/cart`;
      } else {
        close();
      }
    };
  })();
  
  /* ======================================================
     5️⃣ Return visitor (cookie-only, no params)
  ====================================================== */
  (function affiliateReturnVisitorReminder() {
    const SESSION_KEY = "__hq_affiliate_return_shown";
    const REF_COOKIE = "__hqref";
  
    if (sessionStorage.getItem(SESSION_KEY)) return;
    if (location.pathname.includes("/checkout")) return;
  
    const hasParams = new URLSearchParams(location.search).has("ref");
    if (hasParams) return;
  
    const match = document.cookie.match(
      new RegExp("(^| )" + REF_COOKIE + "=([^;]+)")
    );
    if (!match) return;
  
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
  