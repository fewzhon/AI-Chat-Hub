// broadcast-injector.js
//
// Content script bundled with the extension and statically declared in
// manifest.json. It is injected into the 5 AI chat sites enabled for the
// Compare/Broadcast feature (Gemini, ChatGPT, Claude, Perplexity, DeepSeek)
// at `document_idle`, with `all_frames: true`.
//
// Communication is via window.postMessage scoped to the parent frame:
//
//   Parent  ──  {type: "CHATHUB_PING"}                  ──▶ this script
//   parent ◀── {type: "CHATHUB_READY",   site}          ── this script
//   Parent  ──  {type: "CHATHUB_SEND_PROMPT", text}     ──▶ this script
//   Parent ◀──  {type: "CHATHUB_RESULT",  site, ok, error?}  ── this script
//
// The script only acts on messages from `window.parent` and only when that
// parent is a different window (i.e. we're loaded in an iframe). When a
// user visits the AI site in a plain tab (no parent frame), the script
// stays dormant - it just sits there with a message listener that no one
// ever posts to.

(() => {
  // -------------------------------------------------------------------
  // Per-site configuration. Selector arrays are tried in order until one
  // matches. Sites redesign their DOM regularly, so multiple candidates
  // are listed for robustness.
  // -------------------------------------------------------------------
  const SITE_CONFIGS = {
    gemini: {
      hosts: ['gemini.google.com', 'bard.google.com'],
      inputType: 'contenteditable',
      inputSelectors: [
        'rich-textarea div.ql-editor[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        '[role="textbox"][contenteditable="true"]',
      ],
      sendButtonSelectors: [
        'button.send-button[aria-label*="Send" i]:not([disabled])',
        'button[aria-label*="Send message" i]:not([disabled])',
        'button[aria-label*="Send" i]:not([disabled])',
      ],
    },
    chatgpt: {
      hosts: ['chatgpt.com', 'chat.openai.com'],
      inputType: 'contenteditable',
      inputSelectors: [
        '#prompt-textarea[contenteditable="true"]',
        'div#prompt-textarea',
        'textarea#prompt-textarea',
        'div.ProseMirror[contenteditable="true"]',
      ],
      sendButtonSelectors: [
        'button[data-testid="send-button"]:not([disabled])',
        'button[aria-label="Send prompt" i]:not([disabled])',
        'button[aria-label*="Send" i]:not([disabled])',
      ],
    },
    claude: {
      hosts: ['claude.ai'],
      inputType: 'contenteditable',
      inputSelectors: [
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'fieldset div[contenteditable="true"]',
      ],
      sendButtonSelectors: [
        'button[aria-label="Send Message" i]:not([disabled])',
        'button[aria-label*="Send" i]:not([disabled])',
        'fieldset button[type="button"][aria-label*="Send" i]:not([disabled])',
      ],
    },
    perplexity: {
      hosts: ['perplexity.ai', 'www.perplexity.ai', 'pplx.ai', 'www.pplx.ai'],
      inputType: 'textarea',
      inputSelectors: [
        'textarea[placeholder*="Ask" i]',
        'textarea#search',
        'textarea[name="q"]',
        'textarea',
      ],
      sendButtonSelectors: [
        'button[aria-label*="Submit" i]:not([disabled])',
        'button[data-testid*="submit" i]:not([disabled])',
        'button[type="submit"]:not([disabled])',
      ],
    },
    deepseek: {
      hosts: ['chat.deepseek.com', 'deepseek.com'],
      inputType: 'textarea',
      inputSelectors: [
        'textarea#chat-input',
        'textarea[placeholder*="Send" i]',
        'textarea[placeholder*="message" i]',
        'textarea',
      ],
      sendButtonSelectors: [
        'div[role="button"][aria-disabled="false"]',
        'button[type="submit"]:not([disabled])',
        'button[aria-label*="send" i]:not([disabled])',
      ],
    },
  };

  // -------------------------------------------------------------------
  // Host detection
  // -------------------------------------------------------------------
  function detectSite() {
    const host = location.hostname.toLowerCase();
    for (const [key, cfg] of Object.entries(SITE_CONFIGS)) {
      if (cfg.hosts.some((h) => host === h || host.endsWith('.' + h))) {
        return { key, cfg };
      }
    }
    return null;
  }

  const site = detectSite();
  if (!site) return;

  // Only act when actually embedded in our extension UI. In a plain tab
  // window.parent === window, so we simply stay quiet.
  if (window.parent === window) return;

  const SITE_KEY = site.key;
  const CFG = site.cfg;

  // -------------------------------------------------------------------
  // DOM helpers
  // -------------------------------------------------------------------
  function findFirst(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function waitForInput(timeoutMs = 30000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const el = findFirst(CFG.inputSelectors);
        if (el) return resolve(el);
        if (Date.now() - start > timeoutMs) return resolve(null);
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  // Set the value of a textarea/input in a way that triggers React/Vue
  // onChange handlers (which override the native value descriptor).
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function typeIntoContentEditable(el, text) {
    el.focus();

    // Move cursor to end and clear existing content first.
    try {
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
    } catch {
      // selectAll/delete may not be available; fall back to manual clear.
      el.textContent = '';
    }

    // execCommand is deprecated but is still the most reliable cross-site
    // way to type text into a contenteditable so that the host framework
    // notices. Fall back to manual DOM manipulation if it isn't supported.
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      el.textContent = text;
    }

    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  }

  async function setInputValue(el, text) {
    if (CFG.inputType === 'textarea') {
      setNativeValue(el, text);
    } else {
      await typeIntoContentEditable(el, text);
    }
  }

  async function waitForSendEnabled(timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const btn = findFirst(CFG.sendButtonSelectors);
      if (btn) return btn;
      await sleep(100);
    }
    return null;
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // -------------------------------------------------------------------
  // Public actions
  // -------------------------------------------------------------------
  async function sendPrompt(text) {
    const input = findFirst(CFG.inputSelectors);
    if (!input) throw new Error(`Input element not found (selectors: ${CFG.inputSelectors.join(', ')})`);

    await setInputValue(input, text);
    // Give the host framework a moment to enable the send button.
    await sleep(250);

    const sendBtn = await waitForSendEnabled();
    if (sendBtn) {
      sendBtn.click();
      return;
    }

    // Fallback: dispatch Enter on the input (this works on some sites
    // but is blocked by the Gemini Enter-blocker content script, hence
    // we always prefer clicking the send button when available).
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
    }));
  }

  // -------------------------------------------------------------------
  // Message routing
  // -------------------------------------------------------------------
  function reply(payload) {
    try {
      window.parent.postMessage(payload, '*');
    } catch {
      // ignore - parent may be gone
    }
  }

  window.addEventListener('message', async (event) => {
    // Only listen to messages from our parent frame.
    if (event.source !== window.parent) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'CHATHUB_PING') {
      reply({ type: 'CHATHUB_READY', site: SITE_KEY, url: location.href });
      return;
    }

    if (msg.type === 'CHATHUB_SEND_PROMPT') {
      const text = typeof msg.text === 'string' ? msg.text : '';
      if (!text) {
        reply({ type: 'CHATHUB_RESULT', site: SITE_KEY, ok: false, error: 'empty prompt' });
        return;
      }
      try {
        await sendPrompt(text);
        reply({ type: 'CHATHUB_RESULT', site: SITE_KEY, ok: true });
      } catch (err) {
        reply({ type: 'CHATHUB_RESULT', site: SITE_KEY, ok: false, error: err && err.message ? err.message : String(err) });
      }
    }
  });

  // -------------------------------------------------------------------
  // Initial readiness signal once the input element materializes
  // -------------------------------------------------------------------
  (async () => {
    const input = await waitForInput();
    reply({ type: 'CHATHUB_READY', site: SITE_KEY, url: location.href, found: !!input });
  })();
})();
