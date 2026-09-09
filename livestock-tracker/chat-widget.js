/* ========================================
   LIVESTOCK TRACKER CHAT WIDGET
   ======================================== */

const LT_CHAT_ENDPOINT =
  "https://fennington-assistant--fennington-assistant.us-central1.hosted.app/api/website/chat";
const LT_CHAT_SITE = "livestock-tracker";
const LT_CHAT_THREAD_KEY = "lt_chat_thread_id";
const LT_CHAT_CONSENT_KEY = "lt_chat_consent_ack";
const LT_CHAT_TRANSCRIPT_KEY = "lt_chat_transcript";
const LT_CHAT_MAX_HISTORY = 8;
const LT_CHAT_SUPPORT_EMAIL = "support@fennington.com";

function ltChatThreadId() {
  try {
    let id = localStorage.getItem(LT_CHAT_THREAD_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(LT_CHAT_THREAD_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function ltChatHasConsent() {
  try {
    return localStorage.getItem(LT_CHAT_CONSENT_KEY) === "true";
  } catch {
    return false;
  }
}

function ltChatSetConsent() {
  try {
    localStorage.setItem(LT_CHAT_CONSENT_KEY, "true");
  } catch {
    /* ignore storage failures, consent card will just reappear next visit */
  }
}

function ltChatLoadTranscript() {
  try {
    const raw = sessionStorage.getItem(LT_CHAT_TRANSCRIPT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function ltChatSaveTranscript(transcript) {
  try {
    sessionStorage.setItem(LT_CHAT_TRANSCRIPT_KEY, JSON.stringify(transcript));
  } catch {
    /* ignore storage failures, history just won't survive a refresh */
  }
}

function initLivestockChatWidget() {
  const launcher = document.createElement("button");
  launcher.className = "lt-chat-launcher";
  launcher.setAttribute("aria-label", "Chat with Livestock Tracker Assistant");
  launcher.textContent = "💬";
  document.body.appendChild(launcher);

  const panel = document.createElement("div");
  panel.className = "lt-chat-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="lt-chat-header">
      <div>
        <div class="lt-chat-header-title">Livestock Tracker Assistant</div>
        <div class="lt-chat-header-subtitle">AI-powered, here to help</div>
      </div>
      <button class="lt-chat-close" aria-label="Close chat">&times;</button>
    </div>
    <div class="lt-chat-body" id="ltChatBody"></div>
    <div class="lt-chat-escape">
      Prefer email? Reach us at <a href="mailto:${LT_CHAT_SUPPORT_EMAIL}">${LT_CHAT_SUPPORT_EMAIL}</a>
    </div>
    <form class="lt-chat-footer" id="ltChatForm">
      <textarea class="lt-chat-input" id="ltChatInput" rows="1" placeholder="Ask a question..." maxlength="2000"></textarea>
      <button type="submit" class="lt-chat-send" id="ltChatSend">Send</button>
    </form>
  `;
  document.body.appendChild(panel);

  const body = panel.querySelector("#ltChatBody");
  const form = panel.querySelector("#ltChatForm");
  const input = panel.querySelector("#ltChatInput");
  const sendButton = panel.querySelector("#ltChatSend");
  const closeButton = panel.querySelector(".lt-chat-close");

  let transcript = ltChatLoadTranscript();
  let sending = false;
  let lastFailedMessage = null;

  function addBubble(role, text) {
    const bubble = document.createElement("div");
    bubble.className =
      "lt-chat-bubble " + (role === "user" ? "lt-chat-bubble-user" : "lt-chat-bubble-assistant");
    bubble.textContent = text;
    body.appendChild(bubble);
    body.scrollTop = body.scrollHeight;
    return bubble;
  }

  function addErrorBubble(text, onRetry) {
    const bubble = document.createElement("div");
    bubble.className = "lt-chat-bubble lt-chat-bubble-error";
    bubble.textContent = text + " ";
    if (onRetry) {
      const retry = document.createElement("a");
      retry.href = "#";
      retry.textContent = "Retry";
      retry.style.fontWeight = "600";
      retry.addEventListener("click", (event) => {
        event.preventDefault();
        onRetry();
      });
      bubble.appendChild(retry);
    }
    body.appendChild(bubble);
    body.scrollTop = body.scrollHeight;
  }

  function showTyping() {
    const typing = document.createElement("div");
    typing.className = "lt-chat-typing";
    typing.id = "ltChatTyping";
    typing.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;
  }

  function hideTyping() {
    const typing = document.getElementById("ltChatTyping");
    if (typing) typing.remove();
  }

  function renderConsentCard() {
    const card = document.createElement("div");
    card.className = "lt-chat-consent";
    card.id = "ltChatConsent";
    card.innerHTML = `
      <p>Hi! I'm an AI assistant that can answer questions about Livestock Tracker. By chatting, you agree your message may be reviewed by our support team. Please don't share sensitive personal or payment info.
      See our <a href="privacy-policy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
      <button type="button" class="lt-chat-consent-accept" id="ltChatConsentAccept">I Agree &amp; Start Chat</button>
    `;
    body.appendChild(card);
    card.querySelector("#ltChatConsentAccept").addEventListener("click", () => {
      ltChatSetConsent();
      card.remove();
      addBubble("assistant", "Hi! Ask me anything about the app — sync, subscriptions, tracking animals, and more.");
      input.disabled = false;
      sendButton.disabled = false;
      input.focus();
    });
  }

  function renderExistingTranscript() {
    transcript.forEach((entry) => addBubble(entry.role, entry.text));
  }

  async function sendMessage(text) {
    if (sending) return;
    sending = true;
    lastFailedMessage = null;
    input.disabled = true;
    sendButton.disabled = true;
    showTyping();

    const historyForRequest = transcript.slice(-LT_CHAT_MAX_HISTORY);

    try {
      const response = await fetch(LT_CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: LT_CHAT_SITE,
          externalThreadId: ltChatThreadId(),
          message: text,
          history: historyForRequest,
          pageUrl: window.location.href,
          privacyConsent: true,
        }),
      });

      hideTyping();

      if (response.status === 429) {
        addErrorBubble("You're sending messages a bit quickly — please wait a minute and try again.");
        lastFailedMessage = text;
        return;
      }
      if (!response.ok) {
        addErrorBubble("Something went wrong on our end.", () => sendMessage(text));
        lastFailedMessage = text;
        return;
      }

      const data = await response.json();
      const reply = typeof data.reply === "string" ? data.reply : "Sorry, something went wrong.";
      addBubble("assistant", reply);
      transcript.push({ role: "user", text });
      transcript.push({ role: "assistant", text: reply });
      ltChatSaveTranscript(transcript);
    } catch {
      hideTyping();
      addErrorBubble("Couldn't reach the chat right now — check your connection and try again.", () =>
        sendMessage(text),
      );
      lastFailedMessage = text;
    } finally {
      sending = false;
      input.disabled = false;
      sendButton.disabled = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addBubble("user", text);
    input.value = "";
    input.style.height = "auto";
    void sendMessage(text);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 90) + "px";
  });

  let opened = false;
  function openPanel() {
    panel.hidden = false;
    launcher.hidden = true;
    if (!opened) {
      opened = true;
      if (transcript.length > 0) {
        renderExistingTranscript();
        input.disabled = false;
        sendButton.disabled = false;
      } else if (ltChatHasConsent()) {
        addBubble("assistant", "Hi! Ask me anything about the app — sync, subscriptions, tracking animals, and more.");
        input.disabled = false;
        sendButton.disabled = false;
      } else {
        input.disabled = true;
        sendButton.disabled = true;
        renderConsentCard();
      }
    }
    input.focus();
  }

  function closePanel() {
    panel.hidden = true;
    launcher.hidden = false;
  }

  launcher.addEventListener("click", openPanel);
  closeButton.addEventListener("click", closePanel);

  input.disabled = true;
  sendButton.disabled = true;
  void lastFailedMessage;
}

document.addEventListener("DOMContentLoaded", function () {
  initLivestockChatWidget();
});
