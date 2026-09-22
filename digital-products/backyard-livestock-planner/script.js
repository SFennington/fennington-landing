(function () {
  // Tier slugs, most complete first. success.html gets only a session_id back from
  // Stripe, so it probes these in order to learn which tier was bought.
  const PRODUCT_SLUGS = ["backyard-livestock-planner", "backyard-livestock-planner-ebook"];

  const analytics = {
    track(eventName, details) {
      if (window.fenningtonAnalytics && typeof window.fenningtonAnalytics.track === "function") {
        window.fenningtonAnalytics.track(eventName, details || {});
      }
    }
  };

  function setText(element, message) {
    if (element) element.textContent = message || "";
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  function setupMobileMenu() {
    const toggle = document.getElementById("mobileToggle");
    const nav = document.getElementById("mainNav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      const open = !nav.classList.contains("active");
      nav.classList.toggle("active", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  function setupCheckout() {
    document.querySelectorAll("[data-checkout-slug]").forEach((button) => {
      const slug = button.getAttribute("data-checkout-slug");
      const status = document.querySelector(`[data-checkout-status="${slug}"]`);
      button.addEventListener("click", async () => {
        analytics.track("planner_checkout_click", { slug });
        button.disabled = true;
        setText(status, "Creating secure checkout...");
        try {
          const data = await postJson(`/api/digital-products/${encodeURIComponent(slug)}/create-checkout-session`);
          analytics.track("planner_checkout_created", { slug, sessionId: data.sessionId });
          window.location.assign(data.url);
        } catch (error) {
          setText(status, error.message || "Checkout is not available yet.");
          button.disabled = false;
        }
      });
    });
  }

  async function fetchPurchaseStatus(sessionId) {
    for (const slug of PRODUCT_SLUGS) {
      try {
        const response = await fetch(`/api/digital-products/${encodeURIComponent(slug)}/purchase-status?session_id=${encodeURIComponent(sessionId)}`);
        if (!response.ok) continue;
        const data = await response.json().catch(() => ({}));
        if (data && data.status) return { slug, data };
      } catch (error) {
        // Try the next tier before giving up.
      }
    }
    return null;
  }

  async function setupSuccessPage() {
    const message = document.getElementById("successMessage");
    if (!message) return;
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      message.textContent = "No checkout session was provided. Use access recovery if you already purchased.";
      return;
    }
    const result = await fetchPurchaseStatus(sessionId);
    if (!result) {
      message.textContent = "Unable to verify purchase status right now. If checkout was completed, use access recovery or contact support.";
      return;
    }
    const { slug, data } = result;
    if (data.status === "fulfilled") {
      message.textContent = "Payment is confirmed and fulfillment has been recorded. Check the email used at checkout for your secure access link.";
      analytics.track("planner_purchase_confirmed", { slug, sessionId });
    } else if (data.status === "paid_pending_fulfillment") {
      message.textContent = "Stripe shows the payment as complete. Fulfillment is still pending; refresh shortly or contact support if the email does not arrive.";
    } else {
      message.textContent = "The purchase is not fulfilled yet. If checkout was completed, the webhook may still be processing.";
    }
    setText(document.getElementById("successStatus"), data.emailStatus ? `Email status: ${data.emailStatus}` : "");
  }

  function setupDownloads() {
    const token = new URLSearchParams(window.location.search).get("token");
    const panel = document.getElementById("tokenDownloads");
    if (!token || !panel) return;
    panel.hidden = true;
    const status = document.getElementById("downloadStatus");
    document.querySelectorAll("[data-file]").forEach((link) => {
      const file = link.getAttribute("data-file");
      link.setAttribute("href", `/api/digital-products/download?token=${encodeURIComponent(token)}&file=${encodeURIComponent(file)}`);
      link.addEventListener("click", () => {
        analytics.track("planner_download_started", { file });
        setText(status, "Download started. If it does not begin, request a fresh access link.");
      });
    });
    panel.hidden = false;
  }

  function setupRecovery() {
    const form = document.getElementById("recoverAccessForm");
    if (!form) return;
    const status = document.getElementById("recoveryStatus");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = new FormData(form).get("email");
      setText(status, "Checking purchase records...");
      // A buyer knows their email, not which tier they bought, so ask every tier.
      const results = await Promise.allSettled(
        PRODUCT_SLUGS.map((slug) => postJson(`/api/digital-products/${encodeURIComponent(slug)}/recover-access`, { email }))
      );
      if (results.some((result) => result.status === "fulfilled")) {
        analytics.track("planner_recovery_submitted");
        setText(status, "If that email matches a purchase, a fresh access link has been sent.");
        form.reset();
      } else {
        setText(status, "Access recovery is not available right now. Please contact support.");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    analytics.track("planner_page_view", { path: window.location.pathname });
    setupMobileMenu();
    setupCheckout();
    setupSuccessPage();
    setupDownloads();
    setupRecovery();
  });
}());
