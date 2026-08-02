(function () {
  const analytics = {
    track(eventName, details) {
      if (window.fenningtonAnalytics && typeof window.fenningtonAnalytics.track === "function") {
        window.fenningtonAnalytics.track(eventName, details || {});
      }
    }
  };

  function setText(id, message) {
    const element = document.getElementById(id);
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
    const button = document.getElementById("checkoutButton");
    document.querySelectorAll(".js-checkout-link").forEach((link) => {
      link.addEventListener("click", () => analytics.track("chore_tracker_checkout_click"));
    });
    if (!button) return;
    button.addEventListener("click", async () => {
      analytics.track("chore_tracker_checkout_click");
      button.disabled = true;
      setText("checkoutStatus", "Creating secure checkout...");
      try {
        const data = await postJson("/api/chore-tracker/create-checkout-session");
        analytics.track("chore_tracker_checkout_created", { sessionId: data.sessionId });
        window.location.assign(data.url);
      } catch (error) {
        setText("checkoutStatus", error.message || "Checkout is not available yet.");
        button.disabled = false;
      }
    });
  }

  async function setupSuccessPage() {
    const message = document.getElementById("successMessage");
    if (!message) return;
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      message.textContent = "No checkout session was provided. Use access recovery if you already purchased.";
      return;
    }
    try {
      const response = await fetch(`/api/chore-tracker/purchase-status?session_id=${encodeURIComponent(sessionId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to verify purchase status.");
      if (data.status === "fulfilled") {
        message.textContent = "Payment is confirmed and fulfillment has been recorded. Check the email used at checkout for your secure access link.";
        analytics.track("chore_tracker_purchase_confirmed", { sessionId });
      } else if (data.status === "paid_pending_fulfillment") {
        message.textContent = "Stripe shows the payment as complete. Fulfillment is still pending; refresh shortly or contact support if the email does not arrive.";
      } else {
        message.textContent = "The purchase is not fulfilled yet. If checkout was completed, the webhook may still be processing.";
      }
      setText("successStatus", data.emailStatus ? `Email status: ${data.emailStatus}` : "");
    } catch (error) {
      message.textContent = error.message || "Unable to verify purchase status.";
    }
  }

  function setupDownloads() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const panel = document.getElementById("tokenDownloads");
    if (!token || !panel) return;
    panel.hidden = false;
    document.querySelectorAll("[data-file]").forEach((link) => {
      const file = link.getAttribute("data-file");
      link.setAttribute("href", `/api/chore-tracker/download?token=${encodeURIComponent(token)}&file=${encodeURIComponent(file)}`);
      link.addEventListener("click", () => {
        analytics.track("chore_tracker_download_started", { file });
        setText("downloadStatus", "Download started. If it does not begin, request a fresh access link.");
      });
    });
  }

  function setupRecovery() {
    const form = document.getElementById("recoverAccessForm");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = new FormData(form).get("email");
      setText("recoveryStatus", "Checking purchase records...");
      try {
        await postJson("/api/chore-tracker/recover-access", { email });
        analytics.track("chore_tracker_recovery_submitted");
        setText("recoveryStatus", "If that email matches a purchase, a fresh access link will be sent when email fulfillment is configured.");
        form.reset();
      } catch (error) {
        setText("recoveryStatus", error.message || "Access recovery is not available right now.");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    analytics.track("chore_tracker_page_view", { path: window.location.pathname });
    setupMobileMenu();
    setupCheckout();
    setupSuccessPage();
    setupDownloads();
    setupRecovery();
  });
}());
