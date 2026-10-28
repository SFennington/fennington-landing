/* ========================================
   FENNINGTON HOME PAGE JS
   ======================================== */

// fennington.com is static hosting that answers every unknown path with this page,
// so a relative "/api/..." call never reaches the API. Call the function directly.
const API_BASE = (
  window.FENNINGTON_API_BASE ||
  "https://us-central1-fennington-financial.cloudfunctions.net/api"
).replace(/\/$/, "");
const CONTACT_EMAIL = "contact@fennington.com";
const CONTACT_PHONE = "(413) 225-1777";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

document.addEventListener("DOMContentLoaded", () => {
  setupHeader();
  setupMobileMenu();
  setupServiceButtons();
  document.querySelectorAll(".inquiry-form").forEach(setupInquiryForm);

  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
});

// ========== HEADER + MOBILE BAR ==========
function setupHeader() {
  const header = document.getElementById("header");
  const bar = document.querySelector(".mobile-bar");
  const hero = document.querySelector(".hero");
  const contact = document.getElementById("contact");

  const update = () => {
    header.classList.toggle("scrolled", window.scrollY > 8);
    if (!bar || !hero || !contact) return;
    // Show the Call / Request Info bar once past the hero, but not over the form itself.
    const pastHero = window.scrollY > hero.offsetHeight - 80;
    const rect = contact.getBoundingClientRect();
    const atContact = rect.top < window.innerHeight && rect.bottom > 0;
    bar.classList.toggle("visible", pastHero && !atContact);
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
}

function setupMobileMenu() {
  const toggle = document.getElementById("menuToggle");
  const nav = document.getElementById("mainNav");
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  toggle.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

// ========== "ASK ABOUT THIS" ==========
// Each service card ticks its service in the request form and scrolls there.
function setupServiceButtons() {
  const form = document.getElementById("contactForm");
  const contact = document.getElementById("contact");
  if (!form || !contact) return;

  document.querySelectorAll("[data-service]").forEach((button) => {
    button.addEventListener("click", () => {
      const service = button.getAttribute("data-service");
      form.querySelectorAll('input[name="services"]').forEach((box) => {
        if (box.value === service) box.checked = true;
      });
      contact.scrollIntoView();
      track("select_service", { service });
    });
  });
}

// ========== REQUEST FORMS ==========
function setupInquiryForm(form) {
  const status = form.querySelector(".form-status");
  const button = form.querySelector('button[type="submit"]');
  const buttonHtml = button.innerHTML;

  form.addEventListener("input", (event) => {
    event.target.classList.remove("invalid");
    event.target.removeAttribute("aria-invalid");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = readForm(form);
    const problem = validate(form);
    if (problem) {
      showError(status, problem);
      return;
    }

    button.disabled = true;
    button.textContent = "Sending...";
    clearStatus(status);

    try {
      const response = await fetch(`${API_BASE}/inquiries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data)
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 400) {
        // The server's wording is meant for the visitor; they can fix it and resend.
        button.disabled = false;
        button.innerHTML = buttonHtml;
        showError(status, body.error || "Please check the form and try again.");
        return;
      }
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      track("generate_lead", { form_type: data.type });
      showSuccess(form, data);
    } catch (error) {
      button.disabled = false;
      button.innerHTML = buttonHtml;
      showError(status, "Sorry, your request didn't go through.", data);
    }
  });
}

function readForm(form) {
  const formData = new FormData(form);
  const value = (name) => String(formData.get(name) || "").trim();
  return {
    type: form.getAttribute("data-inquiry-type") || "project",
    name: value("name"),
    email: value("email"),
    phone: value("phone"),
    company: value("company"),
    website: value("website"),
    services: formData.getAll("services").map(String),
    budget: value("budget"),
    timeline: value("timeline"),
    contactMethod: value("contactMethod"),
    message: value("message"),
    extra_info: value("extra_info"),
    pageUrl: window.location.href
  };
}

function validate(form) {
  let firstBad = null;
  form.querySelectorAll("[required]").forEach((input) => {
    const text = input.value.trim();
    const bad = !text || (input.type === "email" && !EMAIL_PATTERN.test(text));
    input.classList.toggle("invalid", bad);
    if (bad) input.setAttribute("aria-invalid", "true");
    if (bad && !firstBad) firstBad = input;
  });
  if (!firstBad) return "";
  firstBad.focus();
  return firstBad.type === "email" && firstBad.value.trim()
    ? "Please check your email address."
    : "Please fill in the highlighted fields.";
}

function clearStatus(status) {
  status.textContent = "";
  status.classList.remove("is-error");
}

// With `data`, also offer the request by email and phone so a failed send never loses the lead.
function showError(status, message, data) {
  clearStatus(status);
  status.classList.add("is-error");
  status.append(message);
  if (!data) return;
  const link = document.createElement("a");
  link.href = mailtoFor(data);
  link.textContent = `Email ${CONTACT_EMAIL}`;
  status.append(" ", link, ` or call ${CONTACT_PHONE}.`);
}

function mailtoFor(data) {
  const details = [
    ["Name", data.name],
    ["Email", data.email],
    ["Phone", data.phone],
    ["Business", data.company],
    ["Website", data.website],
    ["Interested in", data.services.join(", ")],
    ["Budget", data.budget],
    ["Timeline", data.timeline]
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  const body = [data.message, details.join("\n")].filter(Boolean).join("\n\n");
  const subject = data.type === "website-review" ? "Free website review request" : "Website inquiry";
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function showSuccess(form, data) {
  const firstName = data.name.split(/\s+/)[0];
  const box = document.createElement("div");
  box.className = "form-success";
  box.setAttribute("tabindex", "-1");
  box.innerHTML = '<div class="success-icon"><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg></div><h3></h3><p></p>';
  box.querySelector("h3").textContent = firstName ? `Thank you, ${firstName}!` : "Thank you!";
  box.querySelector("p").textContent = data.type === "website-review"
    ? "We'll look over your website and email you within one business day."
    : "Your request is in. We'll get back to you within one business day.";

  // Keep the form element (it carries the card styling) and swap its contents.
  Array.from(form.children).forEach((child) => { child.hidden = true; });
  form.append(box);
  box.focus({ preventScroll: true });
}

function track(name, params) {
  if (typeof window.gtag === "function") window.gtag("event", name, params || {});
}
