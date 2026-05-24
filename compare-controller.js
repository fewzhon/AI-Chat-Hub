// compare-controller.js
//
// Renders the multi-AI "Compare" interface (a sticky prompt bar plus a
// stack of AI iframes that can each be checked, collapsed, opened in a
// new tab, or refreshed). The same class powers both the in-side-panel
// experience and the full-tab popout (compare.html).
//
// Communication with the AI iframes is via window.postMessage; each AI
// site has a content script (broadcast-injector.js) declared in the
// manifest which receives the prompt and clicks the site's send button.
//
// State (current prompt text + which AIs are selected) is persisted via
// chrome.storage.session, which is what the "Pop out to tab" button uses
// to seed the popout window's UI with the user's in-progress state.

(function () {
  const BROADCAST_SITES = ['gemini', 'chatgpt', 'claude', 'perplexity', 'deepseek'];

  const SITE_META = {
    gemini:     { name: 'Gemini',     icon: '🤖', url: 'https://gemini.google.com/' },
    chatgpt:    { name: 'ChatGPT',    icon: '💬', url: 'https://chatgpt.com/' },
    claude:     { name: 'Claude',     icon: '🧠', url: 'https://claude.ai/new' },
    perplexity: { name: 'Perplexity', icon: '🔍', url: 'https://www.perplexity.ai/' },
    deepseek:   { name: 'DeepSeek',   icon: '🐋', url: 'https://chat.deepseek.com/' },
  };

  const STORAGE_KEYS = {
    prompt: 'comparePrompt',
    selected: 'compareSelectedSites',
  };

  class CompareView {
    /**
     * @param {Object} opts
     * @param {HTMLElement}    opts.root          The container element to render into.
     * @param {boolean}        opts.canPopout     Whether to render the "Pop out to tab" button (side panel only).
     * @param {Function}       [opts.onPopout]    Callback when popout is clicked; if omitted, falls back to default behavior.
     * @param {Object}         [opts.promptLibrary] Optional shared PromptLibrary instance; if omitted, a fresh one is created.
     * @param {Function}       [opts.onManagePrompts] Optional callback when the picker's "Manage prompts" link is clicked.
     */
    constructor(opts) {
      this.root = opts.root;
      this.canPopout = !!opts.canPopout;
      this.onPopout = opts.onPopout;
      this.promptLibrary = opts.promptLibrary || (window.PromptLibrary ? new window.PromptLibrary() : null);
      this.onManagePrompts = opts.onManagePrompts;

      this.iframes = {};        // siteKey -> HTMLIFrameElement
      this.statusEls = {};      // siteKey -> status display element
      this.checkboxes = {};     // siteKey -> input[type=checkbox]
      this.readyStates = {};    // siteKey -> 'loading' | 'ready' | 'not-found'
      this.lastSent = {};       // siteKey -> { ok, error?, at }
      this.broadcasting = false;
      this.promptPicker = null;

      this.handleMessage = this.handleMessage.bind(this);
      window.addEventListener('message', this.handleMessage);
    }

    async init() {
      this.buildSkeleton();
      await this.restoreState();
      this.attachListeners();
      this.refreshSendButtonState();

      // Prompt picker (only if library + PromptPicker are available in
      // this context). The picker is mounted to the dedicated button
      // built by `buildPromptBar`.
      if (this.promptLibrary && window.PromptPicker && this.pickerBtn) {
        if (!this.promptLibrary.loaded) {
          try { await this.promptLibrary.load(); } catch {}
        }
        this.promptPicker = new window.PromptPicker({
          anchorBtn: this.pickerBtn,
          targetInput: this.promptInput,
          library: this.promptLibrary,
          onManageClick: () => {
            if (typeof this.onManagePrompts === 'function') this.onManagePrompts();
          },
        });
      } else if (this.pickerBtn) {
        // No picker available in this context (popout without library).
        this.pickerBtn.classList.add('hidden');
      }
    }

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------

    buildSkeleton() {
      this.root.innerHTML = '';
      this.root.classList.add('compare-root');

      this.root.appendChild(this.buildPromptBar());
      this.root.appendChild(this.buildPanelList());
    }

    buildPromptBar() {
      const bar = document.createElement('div');
      bar.className = 'compare-prompt-bar';

      const pickerBtn = document.createElement('button');
      pickerBtn.id = 'comparePromptPicker';
      pickerBtn.className = 'compare-picker-btn';
      pickerBtn.title = 'Insert a saved prompt';
      pickerBtn.textContent = '📋';
      this.pickerBtn = pickerBtn;

      const textarea = document.createElement('textarea');
      textarea.id = 'comparePromptInput';
      textarea.placeholder = 'Send a prompt to all selected AIs (Enter to send, Shift+Enter for newline)';
      textarea.rows = 1;
      this.promptInput = textarea;

      const sendBtn = document.createElement('button');
      sendBtn.id = 'compareSendBtn';
      sendBtn.title = 'Send to selected AIs';
      sendBtn.textContent = 'Send';
      this.sendBtn = sendBtn;

      const popoutBtn = document.createElement('button');
      popoutBtn.id = 'comparePopoutBtn';
      popoutBtn.title = 'Open Compare in a full browser tab';
      popoutBtn.textContent = '↗ Pop out';
      this.popoutBtn = popoutBtn;
      if (!this.canPopout) popoutBtn.classList.add('hidden');

      bar.appendChild(pickerBtn);
      bar.appendChild(textarea);
      bar.appendChild(sendBtn);
      bar.appendChild(popoutBtn);
      return bar;
    }

    buildPanelList() {
      const list = document.createElement('div');
      list.className = 'compare-panel-list';

      for (const key of BROADCAST_SITES) {
        list.appendChild(this.buildPanel(key));
      }

      return list;
    }

    buildPanel(siteKey) {
      const meta = SITE_META[siteKey];
      const panel = document.createElement('section');
      panel.className = 'compare-panel';
      panel.dataset.site = siteKey;

      // Header
      const header = document.createElement('div');
      header.className = 'compare-panel-header';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.title = `Include ${meta.name} in broadcasts`;
      this.checkboxes[siteKey] = checkbox;

      const title = document.createElement('span');
      title.className = 'compare-panel-title';
      title.innerHTML = `<span class="compare-panel-icon">${meta.icon}</span> ${meta.name}`;

      const status = document.createElement('span');
      status.className = 'compare-panel-status';
      status.textContent = 'Loading…';
      this.statusEls[siteKey] = status;

      const actions = document.createElement('div');
      actions.className = 'compare-panel-actions';

      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'compare-icon-btn';
      collapseBtn.title = 'Collapse / expand';
      collapseBtn.textContent = '–';
      collapseBtn.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        collapseBtn.textContent = panel.classList.contains('collapsed') ? '+' : '–';
      });

      const reloadBtn = document.createElement('button');
      reloadBtn.className = 'compare-icon-btn';
      reloadBtn.title = 'Reload this AI';
      reloadBtn.textContent = '↻';
      reloadBtn.addEventListener('click', () => this.reloadPanel(siteKey));

      const openTabBtn = document.createElement('button');
      openTabBtn.className = 'compare-icon-btn';
      openTabBtn.title = 'Open this AI in a new browser tab';
      openTabBtn.textContent = '↗';
      openTabBtn.addEventListener('click', () => chrome.tabs.create({ url: meta.url }));

      actions.appendChild(collapseBtn);
      actions.appendChild(reloadBtn);
      actions.appendChild(openTabBtn);

      header.appendChild(checkbox);
      header.appendChild(title);
      header.appendChild(status);
      header.appendChild(actions);

      // Body
      const body = document.createElement('div');
      body.className = 'compare-panel-body';

      const iframe = document.createElement('iframe');
      iframe.src = meta.url;
      iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
      this.iframes[siteKey] = iframe;
      this.readyStates[siteKey] = 'loading';

      body.appendChild(iframe);

      panel.appendChild(header);
      panel.appendChild(body);

      return panel;
    }

    // ------------------------------------------------------------------
    // Event wiring
    // ------------------------------------------------------------------

    attachListeners() {
      this.promptInput.addEventListener('input', () => {
        this.autoResizePromptInput();
        this.refreshSendButtonState();
        this.persistPrompt();
      });

      this.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          this.broadcast();
        }
      });

      this.sendBtn.addEventListener('click', () => this.broadcast());

      if (this.canPopout) {
        this.popoutBtn.addEventListener('click', () => this.handlePopout());
      }

      for (const [siteKey, cb] of Object.entries(this.checkboxes)) {
        cb.addEventListener('change', () => {
          this.refreshSendButtonState();
          this.persistSelected();
          this.root.querySelector(`.compare-panel[data-site="${siteKey}"]`).classList.toggle('disabled', !cb.checked);
        });
      }
    }

    autoResizePromptInput() {
      const ta = this.promptInput;
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    }

    refreshSendButtonState() {
      const text = this.promptInput.value.trim();
      const anySelected = Object.values(this.checkboxes).some((c) => c.checked);
      this.sendBtn.disabled = !text || !anySelected || this.broadcasting;
    }

    // ------------------------------------------------------------------
    // Broadcast
    // ------------------------------------------------------------------

    async broadcast() {
      if (this.broadcasting) return;
      const text = this.promptInput.value.trim();
      if (!text) return;

      const targets = BROADCAST_SITES.filter((k) => this.checkboxes[k].checked);
      if (targets.length === 0) return;

      this.broadcasting = true;
      this.refreshSendButtonState();

      for (const key of targets) {
        this.setStatus(key, 'Sending…', 'pending');
      }

      for (const key of targets) {
        const iframe = this.iframes[key];
        try {
          iframe.contentWindow.postMessage({ type: 'CHATHUB_SEND_PROMPT', text }, '*');
        } catch (err) {
          this.setStatus(key, `Send failed: ${err.message}`, 'error');
        }
      }

      // Optimistically clear the prompt after dispatch; users typically
      // don't want to re-send the same prompt by accident.
      this.promptInput.value = '';
      this.autoResizePromptInput();
      this.persistPrompt();

      this.broadcasting = false;
      this.refreshSendButtonState();
    }

    setStatus(siteKey, text, kind) {
      const el = this.statusEls[siteKey];
      if (!el) return;
      el.textContent = text;
      el.dataset.kind = kind || '';
    }

    reloadPanel(siteKey) {
      const meta = SITE_META[siteKey];
      const iframe = this.iframes[siteKey];
      this.readyStates[siteKey] = 'loading';
      this.setStatus(siteKey, 'Loading…', 'pending');
      iframe.src = meta.url;
    }

    // ------------------------------------------------------------------
    // Message handling from iframes
    // ------------------------------------------------------------------

    handleMessage(event) {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      // Find which iframe this came from.
      let siteKey = null;
      for (const [key, iframe] of Object.entries(this.iframes)) {
        if (iframe.contentWindow === event.source) {
          siteKey = key;
          break;
        }
      }
      if (!siteKey) return;

      if (msg.type === 'CHATHUB_READY') {
        this.readyStates[siteKey] = msg.found === false ? 'not-found' : 'ready';
        if (msg.found === false) {
          this.setStatus(siteKey, 'Ready (input not auto-detected)', 'warn');
        } else {
          this.setStatus(siteKey, 'Ready', 'ok');
        }
      } else if (msg.type === 'CHATHUB_RESULT') {
        if (msg.ok) {
          this.lastSent[siteKey] = { ok: true, at: Date.now() };
          this.setStatus(siteKey, '✓ Sent', 'ok');
        } else {
          this.lastSent[siteKey] = { ok: false, error: msg.error, at: Date.now() };
          this.setStatus(siteKey, `✗ ${msg.error || 'failed'}`, 'error');
        }
      }
    }

    // ------------------------------------------------------------------
    // Pop-out
    // ------------------------------------------------------------------

    async handlePopout() {
      await this.persistPrompt();
      await this.persistSelected();
      if (typeof this.onPopout === 'function') {
        this.onPopout();
        return;
      }
      chrome.tabs.create({ url: chrome.runtime.getURL('compare.html') });
    }

    // ------------------------------------------------------------------
    // State persistence
    // ------------------------------------------------------------------

    async persistPrompt() {
      try {
        await chrome.storage.session.set({ [STORAGE_KEYS.prompt]: this.promptInput.value });
      } catch {}
    }

    async persistSelected() {
      const selected = BROADCAST_SITES.filter((k) => this.checkboxes[k].checked);
      try {
        await chrome.storage.session.set({ [STORAGE_KEYS.selected]: selected });
      } catch {}
    }

    async restoreState() {
      try {
        const stored = await chrome.storage.session.get([STORAGE_KEYS.prompt, STORAGE_KEYS.selected]);
        if (typeof stored[STORAGE_KEYS.prompt] === 'string') {
          this.promptInput.value = stored[STORAGE_KEYS.prompt];
          this.autoResizePromptInput();
        }
        if (Array.isArray(stored[STORAGE_KEYS.selected])) {
          const set = new Set(stored[STORAGE_KEYS.selected]);
          for (const [siteKey, cb] of Object.entries(this.checkboxes)) {
            cb.checked = set.has(siteKey);
            this.root.querySelector(`.compare-panel[data-site="${siteKey}"]`)
              .classList.toggle('disabled', !cb.checked);
          }
        }
      } catch {}
    }

    destroy() {
      window.removeEventListener('message', this.handleMessage);
      if (this.promptPicker) this.promptPicker.destroy();
      this.root.innerHTML = '';
    }
  }

  // Expose globally for the host pages.
  window.CompareView = CompareView;
  window.CompareView.BROADCAST_SITES = BROADCAST_SITES;
  window.CompareView.SITE_META = SITE_META;
})();
