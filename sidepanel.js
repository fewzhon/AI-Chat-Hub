// sidepanel.js
//
// AI Chat Hub - side panel controller.
//
// Architecture:
//   - SITE_CONFIGS is the single source of truth for every AI service. It
//     drives the persistent tab bar (top of the side panel) AND the welcome
//     screen cards. Add a new entry here and the rest of the UI follows.
//   - The AiChatHub class owns view routing, theme management, settings,
//     iframe lifecycle handling, and per-site key storage.
//   - View routing is centralized in `showView(viewName, siteKey)`. Tabs in
//     the top tab bar map directly to view changes.
//
// Theme handling supports three values stored under
// `chrome.storage.sync.themePreference`: 'light', 'dark', or 'system'.
// When 'system' is selected we follow `prefers-color-scheme` and live-update
// on system changes.

const SITE_CONFIGS = {
  // Direct API chat (no iframe).
  api: {
    name: 'Quick Chat',
    icon: '✨',
    description: 'Chat directly with the Gemini API',
    kind: 'api',
  },

  // Multi-AI Compare / broadcast mode (kind 'compare', no iframe URL).
  compare: {
    name: 'Compare',
    icon: '🔄',
    description: 'Send one prompt to multiple AIs at once',
    kind: 'compare',
  },

  // ------ Existing iframe-based services -------------------------------
  gemini: {
    name: 'Gemini',
    icon: '🤖',
    description: "Google's advanced AI assistant",
    url: 'https://gemini.google.com/',
    fallbackUrls: ['https://gemini.google.com/app', 'https://bard.google.com/'],
    embeddable: true,
    kind: 'web',
  },
  chatgpt: {
    name: 'ChatGPT',
    icon: '💬',
    description: "OpenAI's conversational AI",
    url: 'https://chatgpt.com/',
    fallbackUrls: ['https://chat.openai.com/', 'https://platform.openai.com/'],
    embeddable: true,
    kind: 'web',
  },
  perplexity: {
    name: 'Perplexity',
    icon: '🔍',
    description: 'AI-powered search and answers',
    url: 'https://www.perplexity.ai/',
    fallbackUrls: ['https://perplexity.ai/'],
    embeddable: true,
    kind: 'web',
  },
  copilot: {
    name: 'Copilot',
    icon: '🚀',
    description: "Microsoft's AI assistant",
    url: 'https://copilot.microsoft.com/chats',
    fallbackUrls: ['https://copilot.microsoft.com/', 'https://www.bing.com/chat'],
    embeddable: true,
    kind: 'web',
  },
  claude: {
    name: 'Claude',
    icon: '🧠',
    description: "Anthropic's helpful AI assistant",
    url: 'https://claude.ai/new',
    fallbackUrls: ['https://claude.ai/', 'https://claude.ai/chats'],
    embeddable: true,
    kind: 'web',
  },
  grok: {
    name: 'Grok',
    icon: '🌟',
    description: 'AI from xAI',
    url: 'https://grok.com/',
    fallbackUrls: ['https://x.com/i/grok', 'https://accounts.x.ai/'],
    embeddable: true,
    kind: 'web',
  },
  meta: {
    name: 'Meta AI',
    icon: '🔮',
    description: "Meta's AI assistant",
    url: 'https://www.meta.ai/',
    fallbackUrls: ['https://meta.ai/', 'https://ai.meta.com/'],
    embeddable: true,
    kind: 'web',
  },

  // ------ New AI services added in v1.5 --------------------------------
  deepseek: {
    name: 'DeepSeek',
    icon: '🐋',
    description: 'DeepSeek chat',
    url: 'https://chat.deepseek.com/',
    fallbackUrls: ['https://www.deepseek.com/'],
    embeddable: true,
    kind: 'web',
  },
  mistral: {
    name: 'Mistral',
    icon: '🌫️',
    description: "Mistral's Le Chat",
    url: 'https://chat.mistral.ai/chat',
    fallbackUrls: ['https://chat.mistral.ai/', 'https://mistral.ai/'],
    embeddable: true,
    kind: 'web',
  },
  poe: {
    name: 'Poe',
    icon: '🦜',
    description: "Quora's multi-model AI",
    url: 'https://poe.com/',
    fallbackUrls: ['https://www.poe.com/'],
    embeddable: true,
    kind: 'web',
  },
  you: {
    name: 'You.com',
    icon: '🟣',
    description: 'You.com AI search',
    url: 'https://you.com/',
    fallbackUrls: ['https://www.you.com/'],
    embeddable: true,
    kind: 'web',
  },
  qwen: {
    name: 'Qwen',
    icon: '🦅',
    description: "Alibaba's Qwen Chat",
    url: 'https://chat.qwen.ai/',
    fallbackUrls: ['https://qwen.ai/', 'https://tongyi.aliyun.com/qianwen/'],
    embeddable: true,
    kind: 'web',
  },
  kimi: {
    name: 'Kimi',
    icon: '🌙',
    description: "Moonshot AI's Kimi",
    url: 'https://www.kimi.com/',
    fallbackUrls: ['https://kimi.moonshot.cn/'],
    embeddable: true,
    kind: 'web',
  },
  zai: {
    name: 'Z.ai',
    icon: '⚡',
    description: 'Zhipu GLM chat',
    url: 'https://chat.z.ai/',
    fallbackUrls: ['https://z.ai/'],
    embeddable: true,
    kind: 'web',
  },
  genspark: {
    name: 'Genspark',
    icon: '✦',
    description: 'Genspark AI agent',
    url: 'https://www.genspark.ai/',
    fallbackUrls: ['https://genspark.ai/'],
    embeddable: true,
    kind: 'web',
  },
};

// ----------------------------------------------------------------------
// Gemini API (Quick Chat) configuration
// ----------------------------------------------------------------------
// The model is intentionally hard-coded here so the surface area stays
// small for now; a user-facing model picker is on the roadmap.
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Cap saved history to keep `chrome.storage.local` lean. Older messages
// past this count are dropped from BOTH UI and storage.
const MAX_CHAT_HISTORY = 100;

// Display order in tabs and on the welcome screen for first-time users.
// Once the user reorders, removes, or adds tabs, their saved
// `userTabOrder` (chrome.storage.local) takes over. Keep this list as
// the canonical set of platforms shipped with the extension - any new
// platform added here is available via the "+" picker.
const DEFAULT_TAB_ORDER = [
  'api',
  'compare',
  'gemini',
  'chatgpt',
  'claude',
  'perplexity',
  'copilot',
  'grok',
  'meta',
  'deepseek',
  'mistral',
  'poe',
  'you',
  'qwen',
  'kimi',
  'zai',
  'genspark',
];

class AiChatHub {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.elements = {
      // Tab bar
      tabBar: $('tabBar'),
      tabStrip: $('tabStrip'),
      homeTabBtn: $('homeTabBtn'),
      reloadTabBtn: $('reloadTabBtn'),
      settingsTabBtn: $('settingsTabBtn'),

      // Service control bar
      serviceControlBar: $('serviceControlBar'),
      siteName: $('siteName'),
      openInTabBtn: $('openInTabBtn'),

      // Views
      welcomeScreen: $('welcomeScreen'),
      webContainer: $('webContainer'),
      apiKeySetup: $('apiKeySetup'),
      chatContainer: $('chatContainer'),

      // Welcome card containers
      apiCards: $('apiCards'),
      webCards: $('webCards'),
      compareCards: $('compareCards'),

      // Compare view container
      compareContainer: $('compareContainer'),

      // Web view
      webFrame: $('webFrame'),

      // API setup
      apiKeyInput: $('apiKeyInput'),
      saveApiKeyBtn: $('saveApiKeyBtn'),
      backToOptionsFromApi: $('backToOptionsFromApi'),

      // Chat view
      messageInput: $('messageInput'),
      sendBtn: $('sendBtn'),
      messages: $('messages'),
      messagesEmpty: $('messagesEmpty'),
      chatModelLabel: $('chatModelLabel'),
      clearChatBtn: $('clearChatBtn'),
      quickChatPromptPicker: $('quickChatPromptPicker'),

      // Prompts management view
      promptsManageView: $('promptsManageView'),
      promptsList: $('promptsList'),
      promptsForm: $('promptsForm'),
      promptsAddBtn: $('promptsAddBtn'),
      promptsBackBtn: $('promptsBackBtn'),
      promptTitleInput: $('promptTitleInput'),
      promptBodyInput: $('promptBodyInput'),
      promptSaveBtn: $('promptSaveBtn'),
      promptCancelBtn: $('promptCancelBtn'),

      // Settings modal
      settingsModal: $('settingsModal'),
      closeSettingsBtn: $('closeSettingsBtn'),
      themeSegmented: $('themeSegmented'),
      toggleBlocker: $('toggleBlocker'),
      changeApiKeyBtn: $('changeApiKeyBtn'),
      clearChatHistoryBtn: $('clearChatHistoryBtn'),
    };

    this.apiKey = null;
    this.chatHistory = [];
    this.isChatPending = false;
    this.loadAttempts = {};
    this.currentSiteKey = null;
    this.themePreference = 'system';
    this.systemThemeMql = window.matchMedia('(prefers-color-scheme: dark)');

    // CompareView is created lazily the first time the Compare tab is
    // opened, so the 5 AI iframes don't start loading until the user
    // actually wants them. Once initialized, we keep it around so the
    // conversations don't reset on every tab switch.
    this.compareView = null;

    // Prompt library (shared between Quick Chat picker, Compare picker,
    // and the manage view). Loaded asynchronously during init.
    this.promptLibrary = new PromptLibrary();
    this.quickChatPicker = null;
    this.editingPromptId = null;
    this.previousViewBeforeManage = 'welcomeScreen';
    this.previousSiteKeyBeforeManage = null;

    // Customisable tab bar: which tabs the user keeps, and in what
    // order. Defaults to DEFAULT_TAB_ORDER until the user customises.
    this.userTabOrder = [...DEFAULT_TAB_ORDER];
    this.dragState = null;
    this.addTabPopover = null;
    this.addTabHandlers = null;

    this.init();
  }

  async init() {
    // Load the persisted tab order before any rendering so the first
    // paint already reflects the user's customisation.
    await this.loadTabOrder();

    this.renderWelcomeCards();
    this.renderTabBar();
    this.setupEventListeners();
    this.elements.chatModelLabel.textContent = `Gemini · ${GEMINI_MODEL}`;

    await this.promptLibrary.load();
    this.setupPromptPickers();
    this.setupPromptManageView();

    await this.loadSettings();
    await this.loadChatHistory();
    this.updateSendButtonState();
    await this.loadLastState();
  }

  // ------------------------------------------------------------------
  // Tab order persistence + helpers
  // ------------------------------------------------------------------

  async loadTabOrder() {
    try {
      const stored = await chrome.storage.local.get({ userTabOrder: null });
      if (Array.isArray(stored.userTabOrder) && stored.userTabOrder.length > 0) {
        // Drop any keys that are no longer in SITE_CONFIGS (defensive
        // against future renames). Keep saved order otherwise.
        this.userTabOrder = stored.userTabOrder.filter((k) => SITE_CONFIGS[k]);
        if (this.userTabOrder.length === 0) this.userTabOrder = [...DEFAULT_TAB_ORDER];
      } else {
        this.userTabOrder = [...DEFAULT_TAB_ORDER];
      }
    } catch (err) {
      console.error('loadTabOrder failed:', err);
      this.userTabOrder = [...DEFAULT_TAB_ORDER];
    }
  }

  async saveTabOrder() {
    try {
      await chrome.storage.local.set({ userTabOrder: this.userTabOrder });
    } catch (err) {
      console.error('saveTabOrder failed:', err);
    }
  }

  getActiveTabKeys() {
    return this.userTabOrder.filter((k) => SITE_CONFIGS[k]);
  }

  getAvailablePlatforms() {
    return DEFAULT_TAB_ORDER.filter(
      (k) => SITE_CONFIGS[k] && !this.userTabOrder.includes(k)
    );
  }

  async addTab(key) {
    if (!SITE_CONFIGS[key]) return;
    if (this.userTabOrder.includes(key)) return;
    this.userTabOrder.push(key);
    await this.saveTabOrder();
    this.renderTabBar();
    this.renderWelcomeCards();
    this.handleOptionClick(key);
  }

  async removeTab(key) {
    const idx = this.userTabOrder.indexOf(key);
    if (idx < 0) return;
    const wasActive = this.currentSiteKey === key;
    this.userTabOrder.splice(idx, 1);
    await this.saveTabOrder();
    this.renderTabBar();
    this.renderWelcomeCards();

    if (!wasActive) return;
    // If the removed tab was active, fall back to the tab that took
    // its position (or the previous one), and finally Home.
    const nextKey = this.userTabOrder[idx] || this.userTabOrder[idx - 1] || null;
    if (nextKey) {
      this.handleOptionClick(nextKey);
    } else {
      this.currentSiteKey = null;
      this.showView('welcomeScreen', null);
    }
  }

  async reorderTabs(fromKey, toKey, insertBefore) {
    if (fromKey === toKey) return;
    const order = this.userTabOrder;
    const fromIdx = order.indexOf(fromKey);
    if (fromIdx < 0) return;
    order.splice(fromIdx, 1);

    let toIdx = order.indexOf(toKey);
    if (toIdx < 0) {
      // Drop target no longer present (race): append.
      order.push(fromKey);
    } else {
      if (!insertBefore) toIdx += 1;
      order.splice(toIdx, 0, fromKey);
    }
    await this.saveTabOrder();
    this.renderTabBar();
    this.renderWelcomeCards();
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  renderTabBar() {
    const strip = this.elements.tabStrip;
    strip.innerHTML = '';

    for (const key of this.getActiveTabKeys()) {
      const cfg = SITE_CONFIGS[key];
      if (!cfg) continue;
      strip.appendChild(this.buildTabButton(key, cfg));
    }

    strip.appendChild(this.buildAddTabButton());

    // Reflect the active tab visually right after re-render (e.g. after
    // a reorder so the highlight follows the moved tab).
    if (this.currentSiteKey) {
      const activeBtn = strip.querySelector(`[data-site-key="${CSS.escape(this.currentSiteKey)}"]`);
      if (activeBtn) activeBtn.classList.add('is-active');
    }
  }

  buildTabButton(key, cfg) {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.siteKey = key;
    btn.setAttribute('role', 'tab');
    btn.title = cfg.name;
    btn.draggable = true;
    btn.innerHTML = `
      <span class="tab-icon" aria-hidden="true">${cfg.icon}</span>
      <span class="tab-label">${cfg.name}</span>
      <span class="tab-close" role="button" aria-label="Remove ${cfg.name} tab" title="Remove">×</span>
    `;
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) return; // close button handles itself
      this.handleOptionClick(key);
    });
    const closeEl = btn.querySelector('.tab-close');
    closeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeTab(key);
    });

    this.attachTabDragHandlers(btn, key);
    return btn;
  }

  attachTabDragHandlers(btn, key) {
    btn.addEventListener('dragstart', (e) => {
      this.dragState = { key };
      btn.classList.add('dragging');
      // Some browsers refuse to start a drag without setData being called.
      try { e.dataTransfer.setData('text/plain', key); } catch {}
      e.dataTransfer.effectAllowed = 'move';
    });

    btn.addEventListener('dragover', (e) => {
      if (!this.dragState || this.dragState.key === key) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = btn.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      btn.classList.toggle('drop-before', before);
      btn.classList.toggle('drop-after', !before);
    });

    btn.addEventListener('dragleave', () => {
      btn.classList.remove('drop-before', 'drop-after');
    });

    btn.addEventListener('drop', (e) => {
      btn.classList.remove('drop-before', 'drop-after');
      if (!this.dragState || this.dragState.key === key) return;
      e.preventDefault();
      const rect = btn.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      this.reorderTabs(this.dragState.key, key, before);
    });

    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      this.elements.tabStrip
        .querySelectorAll('.tab.drop-before, .tab.drop-after')
        .forEach((el) => el.classList.remove('drop-before', 'drop-after'));
      this.dragState = null;
    });
  }

  buildAddTabButton() {
    const btn = document.createElement('button');
    btn.className = 'tab-add';
    btn.id = 'addTabBtn';
    btn.type = 'button';
    btn.title = 'Add a platform';
    btn.setAttribute('aria-label', 'Add a platform');
    btn.textContent = '+';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleAddTabPopover(btn);
    });
    return btn;
  }

  toggleAddTabPopover(anchor) {
    if (this.addTabPopover) this.closeAddTabPopover();
    else this.openAddTabPopover(anchor);
  }

  openAddTabPopover(anchor) {
    const available = this.getAvailablePlatforms();
    const popover = document.createElement('div');
    popover.className = 'add-tab-popover';

    if (available.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'add-tab-empty';
      empty.textContent = 'All platforms are in your tab bar.';
      popover.appendChild(empty);
    } else {
      for (const key of available) {
        const cfg = SITE_CONFIGS[key];
        const row = document.createElement('button');
        row.className = 'add-tab-row';
        row.innerHTML = `
          <span class="add-tab-row-icon" aria-hidden="true">${cfg.icon}</span>
          <span class="add-tab-row-name"></span>
        `;
        row.querySelector('.add-tab-row-name').textContent = cfg.name;
        row.addEventListener('click', () => {
          this.closeAddTabPopover();
          this.addTab(key);
        });
        popover.appendChild(row);
      }
    }

    document.body.appendChild(popover);
    const rect = anchor.getBoundingClientRect();
    popover.style.position = 'fixed';
    // Position the popover below the + button, right-aligned to it.
    const left = Math.max(
      8,
      Math.min(rect.right - 240, window.innerWidth - 240 - 8)
    );
    popover.style.top = `${rect.bottom + 6}px`;
    popover.style.left = `${left}px`;
    popover.style.width = '240px';

    const onDocClick = (event) => {
      if (popover.contains(event.target)) return;
      if (anchor.contains(event.target)) return;
      this.closeAddTabPopover();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') this.closeAddTabPopover();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', onDocClick);
      document.addEventListener('keydown', onKey);
    }, 0);

    this.addTabPopover = popover;
    this.addTabHandlers = { onDocClick, onKey, anchor };
    anchor.classList.add('is-open');
  }

  closeAddTabPopover() {
    if (!this.addTabPopover) return;
    if (this.addTabPopover.parentNode) {
      this.addTabPopover.parentNode.removeChild(this.addTabPopover);
    }
    const { onDocClick, onKey, anchor } = this.addTabHandlers || {};
    if (onDocClick) document.removeEventListener('mousedown', onDocClick);
    if (onKey) document.removeEventListener('keydown', onKey);
    if (anchor) anchor.classList.remove('is-open');
    this.addTabPopover = null;
    this.addTabHandlers = null;
  }

  renderWelcomeCards() {
    const apiContainer = this.elements.apiCards;
    const webContainer = this.elements.webCards;
    const compareContainer = this.elements.compareCards;
    apiContainer.innerHTML = '';
    webContainer.innerHTML = '';
    compareContainer.innerHTML = '';

    for (const key of this.getActiveTabKeys()) {
      const cfg = SITE_CONFIGS[key];
      if (!cfg) continue;

      const row = document.createElement('div');
      row.className = 'option-card-container';

      const card = document.createElement('div');
      card.className = 'option-card';
      card.dataset.site = key;
      card.innerHTML = `
        <span class="card-icon">${cfg.icon}</span>
        <div class="card-text">
          <h3>${cfg.name}</h3>
          <p>${cfg.description}</p>
        </div>
      `;
      card.addEventListener('click', () => this.handleOptionClick(key));
      row.appendChild(card);

      if (cfg.kind === 'web' && cfg.url) {
        const newTabBtn = document.createElement('button');
        newTabBtn.className = 'new-tab-button';
        newTabBtn.title = `Open ${cfg.name} in a new browser tab`;
        newTabBtn.innerHTML = '<span class="new-tab-icon">↗</span>';
        newTabBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          chrome.tabs.create({ url: cfg.url });
        });
        row.appendChild(newTabBtn);
      }

      if (cfg.kind === 'api') apiContainer.appendChild(row);
      else if (cfg.kind === 'compare') compareContainer.appendChild(row);
      else webContainer.appendChild(row);
    }
  }

  // ------------------------------------------------------------------
  // Event wiring
  // ------------------------------------------------------------------

  setupEventListeners() {
    this.elements.homeTabBtn.addEventListener('click', () => this.showWelcomeScreen());

    this.elements.reloadTabBtn.addEventListener('click', () => this.reloadCurrentView());

    this.elements.settingsTabBtn.addEventListener('click', () => this.openSettings());

    this.elements.openInTabBtn.addEventListener('click', () => {
      const cfg = SITE_CONFIGS[this.currentSiteKey];
      if (cfg && cfg.url) chrome.tabs.create({ url: cfg.url });
    });

    // API setup
    this.elements.backToOptionsFromApi.addEventListener('click', () => this.showWelcomeScreen());
    this.elements.saveApiKeyBtn.addEventListener('click', () => this.saveApiKey());

    // Settings modal
    this.elements.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    this.elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.elements.settingsModal) this.closeSettings();
    });
    this.elements.toggleBlocker.addEventListener('change', (e) => {
      this.saveSetting('geminiBlockEnabled', e.target.checked, 'sync');
    });
    this.elements.changeApiKeyBtn.addEventListener('click', () => {
      this.closeSettings();
      this.showView('apiKeySetup', 'api');
    });

    // Theme segmented control
    this.elements.themeSegmented.querySelectorAll('button[data-theme-value]').forEach((btn) => {
      btn.addEventListener('click', () => this.setTheme(btn.dataset.themeValue));
    });

    // Live-update theme when system preference changes (only if user picked 'system')
    this.systemThemeMql.addEventListener('change', () => {
      if (this.themePreference === 'system') this.applyTheme();
    });

    // Iframe lifecycle
    this.elements.webFrame.addEventListener('load', () => this.handleFrameLoad());
    this.elements.webFrame.addEventListener('error', (e) => this.handleFrameError(e));

    // CSP violations (best-effort detection of frame-ancestors blocks)
    document.addEventListener('securitypolicyviolation', (e) => this.handleCSPViolation(e));

    // Quick Chat input
    this.elements.sendBtn.addEventListener('click', () => this.sendMessage());

    this.elements.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.elements.messageInput.addEventListener('input', () => {
      this.autoResizeTextarea();
      this.updateSendButtonState();
    });

    this.elements.clearChatBtn.addEventListener('click', () => this.confirmClearChatHistory());
    this.elements.clearChatHistoryBtn.addEventListener('click', () => this.confirmClearChatHistory());
  }

  // ------------------------------------------------------------------
  // View routing
  // ------------------------------------------------------------------

  showView(viewName, siteKey) {
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    if (this.elements[viewName]) this.elements[viewName].classList.remove('hidden');

    const cfg = siteKey ? SITE_CONFIGS[siteKey] : null;
    if (cfg && viewName !== 'welcomeScreen') {
      this.elements.serviceControlBar.classList.remove('hidden');
      this.elements.siteName.textContent = `${cfg.icon} ${cfg.name}`;
      // Hide "Open in tab" for the API view since it has no URL.
      this.elements.openInTabBtn.classList.toggle('hidden', cfg.kind !== 'web');
      this.currentSiteKey = siteKey;
    } else {
      this.elements.serviceControlBar.classList.add('hidden');
      this.currentSiteKey = null;
    }

    this.updateActiveTab(siteKey);
  }

  updateActiveTab(siteKey) {
    this.elements.tabStrip.querySelectorAll('.tab').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.siteKey === siteKey);
    });

    if (siteKey) {
      const activeBtn = this.elements.tabStrip.querySelector(`.tab[data-site-key="${siteKey}"]`);
      if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  handleOptionClick(siteKey) {
    const cfg = SITE_CONFIGS[siteKey];
    if (!cfg) return;

    if (cfg.kind === 'api') {
      if (this.apiKey) {
        this.showView('chatContainer', 'api');
      } else {
        this.showView('apiKeySetup', 'api');
      }
      this.saveSetting('lastSite', siteKey, 'local');
      return;
    }

    if (cfg.kind === 'compare') {
      this.ensureCompareView();
      this.showView('compareContainer', 'compare');
      this.saveSetting('lastSite', siteKey, 'local');
      return;
    }

    if (cfg.embeddable === false) {
      this.showNonEmbeddableMessage(siteKey);
      this.saveSetting('lastSite', siteKey, 'local');
      return;
    }

    this.showView('webContainer', siteKey);
    this.loadAttempts[siteKey] = 0;
    if (this.elements.webFrame.src !== cfg.url) {
      this.elements.webFrame.src = cfg.url;
    }
    this.saveSetting('lastSite', siteKey, 'local');
  }

  ensureCompareView() {
    if (this.compareView) return;
    this.compareView = new CompareView({
      root: this.elements.compareContainer,
      canPopout: true,
      promptLibrary: this.promptLibrary,
      onManagePrompts: () => this.showPromptsManageView(),
    });
    this.compareView.init();
  }

  // ------------------------------------------------------------------
  // Prompt library: pickers and manage view
  // ------------------------------------------------------------------

  setupPromptPickers() {
    this.quickChatPicker = new PromptPicker({
      anchorBtn: this.elements.quickChatPromptPicker,
      targetInput: this.elements.messageInput,
      library: this.promptLibrary,
      onManageClick: () => this.showPromptsManageView(),
    });
  }

  showPromptsManageView() {
    // Remember where we came from so the Back button returns there.
    this.previousViewBeforeManage = this.findCurrentViewName() || 'welcomeScreen';
    this.previousSiteKeyBeforeManage = this.currentSiteKey;
    this.hidePromptForm();
    this.showView('promptsManageView', null);
    this.renderPromptsList();
  }

  findCurrentViewName() {
    for (const name of ['welcomeScreen', 'webContainer', 'chatContainer', 'apiKeySetup', 'compareContainer', 'promptsManageView']) {
      const el = this.elements[name];
      if (el && !el.classList.contains('hidden')) return name;
    }
    return null;
  }

  setupPromptManageView() {
    this.elements.promptsAddBtn.addEventListener('click', () => this.showPromptForm(null));
    this.elements.promptsBackBtn.addEventListener('click', () => this.returnFromManageView());
    this.elements.promptSaveBtn.addEventListener('click', () => this.savePromptForm());
    this.elements.promptCancelBtn.addEventListener('click', () => this.hidePromptForm());

    // Live-refresh the list whenever the underlying library changes.
    this.promptLibrary.subscribe(() => {
      if (this.elements.promptsManageView.classList.contains('hidden')) return;
      this.renderPromptsList();
    });
  }

  returnFromManageView() {
    const view = this.previousViewBeforeManage || 'welcomeScreen';
    const siteKey = this.previousSiteKeyBeforeManage;
    if (siteKey && SITE_CONFIGS[siteKey]) {
      this.handleOptionClick(siteKey);
    } else {
      this.showView(view, null);
    }
  }

  renderPromptsList() {
    const container = this.elements.promptsList;
    container.innerHTML = '';
    const prompts = this.promptLibrary.getAll();

    if (prompts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prompts-manage-empty';
      empty.textContent = 'No prompts yet. Click "+ New" to add one.';
      container.appendChild(empty);
      return;
    }

    for (const prompt of prompts) {
      const item = document.createElement('div');
      item.className = 'prompts-manage-item';

      const text = document.createElement('div');
      text.className = 'text';
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = prompt.title;
      const body = document.createElement('div');
      body.className = 'body';
      body.textContent = prompt.body;
      text.appendChild(title);
      text.appendChild(body);

      const actions = document.createElement('div');
      actions.className = 'actions';
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => this.showPromptForm(prompt.id));
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => this.confirmDeletePrompt(prompt));
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(text);
      item.appendChild(actions);
      container.appendChild(item);
    }
  }

  showPromptForm(id) {
    this.editingPromptId = id;
    const prompt = id ? this.promptLibrary.get(id) : null;
    this.elements.promptTitleInput.value = prompt ? prompt.title : '';
    this.elements.promptBodyInput.value = prompt ? prompt.body : '';
    this.elements.promptsForm.classList.remove('hidden');
    this.elements.promptTitleInput.focus();
  }

  hidePromptForm() {
    this.editingPromptId = null;
    this.elements.promptsForm.classList.add('hidden');
    this.elements.promptTitleInput.value = '';
    this.elements.promptBodyInput.value = '';
  }

  async savePromptForm() {
    const title = this.elements.promptTitleInput.value.trim();
    const body = this.elements.promptBodyInput.value;
    if (!title) { alert('Please enter a title.'); return; }
    if (!body.trim()) { alert('Please enter the prompt body.'); return; }

    if (this.editingPromptId) {
      await this.promptLibrary.update(this.editingPromptId, { title, body });
    } else {
      await this.promptLibrary.add(title, body);
    }
    this.hidePromptForm();
  }

  async confirmDeletePrompt(prompt) {
    if (!window.confirm(`Delete the prompt "${prompt.title}"? This cannot be undone.`)) return;
    await this.promptLibrary.remove(prompt.id);
  }

  showWelcomeScreen() {
    this.showView('welcomeScreen', null);
    this.saveSetting('lastSite', null, 'local');
  }

  reloadCurrentView() {
    const cfg = this.currentSiteKey && SITE_CONFIGS[this.currentSiteKey];
    if (!cfg) return;
    if (cfg.kind === 'web') {
      this.elements.webFrame.src = this.elements.webFrame.src;
    } else if (cfg.kind === 'compare' && this.compareView) {
      // Reload all panels at once.
      for (const key of CompareView.BROADCAST_SITES) this.compareView.reloadPanel(key);
    }
  }

  openSettings() { this.elements.settingsModal.classList.remove('hidden'); }
  closeSettings() { this.elements.settingsModal.classList.add('hidden'); }

  // ------------------------------------------------------------------
  // Theme management
  // ------------------------------------------------------------------

  setTheme(value) {
    this.themePreference = value;
    this.saveSetting('themePreference', value, 'sync');
    this.applyTheme();
  }

  applyTheme() {
    const effective = this.resolveEffectiveTheme();
    document.documentElement.setAttribute('data-theme', effective);

    this.elements.themeSegmented.querySelectorAll('button[data-theme-value]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.themeValue === this.themePreference);
    });
  }

  resolveEffectiveTheme() {
    if (this.themePreference === 'dark') return 'dark';
    if (this.themePreference === 'light') return 'light';
    return this.systemThemeMql.matches ? 'dark' : 'light';
  }

  // ------------------------------------------------------------------
  // Iframe lifecycle (mostly preserved from the previous implementation,
  // de-duplicated and tidied up).
  // ------------------------------------------------------------------

  handleFrameLoad() {
    try {
      const currentUrl = this.elements.webFrame.contentWindow.location.href;

      if (this.isBlockedPage(currentUrl)) {
        if (this.currentSiteKey) {
          this.markSiteAsNonEmbeddable(this.currentSiteKey, 'Content blocked by service');
        }
        return;
      }

      if (this.currentSiteKey) this.loadAttempts[this.currentSiteKey] = 0;

      if (this.isAuthRedirect(currentUrl)) this.showAuthNotification();
    } catch {
      // Cross-origin restrictions prevent inspection; that's normal.
    }
  }

  handleFrameError(event) {
    console.error('Frame loading error:', event);
    if (this.currentSiteKey) this.tryFallbackUrl(this.currentSiteKey);
  }

  handleCSPViolation(event) {
    const directive = event.violatedDirective || '';
    if (!directive.includes('frame-ancestors') && !directive.includes('frame-src')) return;

    const blockedUrl = event.blockedURI || event.documentURI || event.sourceFile;
    const siteKey = this.findSiteKeyByUrl(blockedUrl);
    if (siteKey) this.markSiteAsNonEmbeddable(siteKey, 'CSP frame-ancestors policy');
  }

  isBlockedPage(url) {
    const blockedPatterns = [
      'chrome-error://',
      'chrome://network-error/',
      'about:blank',
      'data:text/html,chromewebdata',
      'chrome-extension://invalid',
    ];
    return blockedPatterns.some((p) => url.includes(p));
  }

  isAuthRedirect(url) {
    const authPatterns = [
      'consent.google.com',
      'accounts.google.com',
      'auth0.openai.com',
      'login.microsoftonline.com',
      'login.live.com',
      '/auth/',
      '/login/',
      '/signin/',
    ];
    return authPatterns.some((p) => url.includes(p));
  }

  findSiteKeyByUrl(url) {
    if (!url) return null;
    const lower = url.toLowerCase();
    for (const [key, cfg] of Object.entries(SITE_CONFIGS)) {
      const candidates = [];
      if (cfg.url) candidates.push(cfg.url);
      if (cfg.fallbackUrls) candidates.push(...cfg.fallbackUrls);
      for (const candidate of candidates) {
        try {
          if (lower.includes(new URL(candidate).hostname.toLowerCase())) return key;
        } catch {
          if (lower.includes(candidate.toLowerCase())) return key;
        }
      }
    }
    return null;
  }

  markSiteAsNonEmbeddable(siteKey, reason) {
    const cfg = SITE_CONFIGS[siteKey];
    if (!cfg) return;
    cfg.embeddable = false;
    cfg.reason = reason;
    if (this.currentSiteKey === siteKey) this.showNonEmbeddableMessage(siteKey);
  }

  tryFallbackUrl(siteKey) {
    const cfg = SITE_CONFIGS[siteKey];
    if (!cfg || !cfg.fallbackUrls) return;
    const attempts = this.loadAttempts[siteKey] || 0;
    if (attempts < cfg.fallbackUrls.length) {
      const fallbackUrl = cfg.fallbackUrls[attempts];
      this.loadAttempts[siteKey] = attempts + 1;
      this.elements.webFrame.src = fallbackUrl;
    } else {
      this.showLoadErrorMessage(siteKey);
    }
  }

  showAuthNotification() {
    const existing = document.getElementById('authNotification');
    if (existing) return;
    const notification = document.createElement('div');
    notification.id = 'authNotification';
    notification.style.cssText = `
      position: fixed; top: 50px; right: 12px;
      background: var(--accent-warning); color: white;
      padding: 10px 12px; border-radius: 8px;
      z-index: 10000; font-size: 12.5px; max-width: 280px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    notification.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">⚠️ Authentication needed</div>
      <div>Complete sign-in in the frame, then refresh.</div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 8000);
  }

  showNonEmbeddableMessage(siteKey) {
    const cfg = SITE_CONFIGS[siteKey];
    const reason = cfg.reason || 'security restrictions';
    this.showView('webContainer', siteKey);

    const messageHtml = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:20px;text-align:center;background:#f8f9fa;color:#333;font-family:-apple-system,sans-serif;">
        <div style="font-size:42px;margin-bottom:14px;">${cfg.icon}</div>
        <h3 style="margin-bottom:10px;color:#1976d2;">${cfg.name}</h3>
        <p style="color:#666;margin-bottom:6px;max-width:340px;">This service can't be embedded due to ${reason}.</p>
        <p style="color:#666;margin-bottom:18px;max-width:340px;">Open it in a new browser tab instead.</p>
        <button id="openInNewTab" style="background:#1976d2;color:white;border:none;padding:12px 22px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;">Open ${cfg.name} in New Tab</button>
      </div>
    `;
    this.elements.webFrame.srcdoc = messageHtml;
    this.elements.webFrame.onload = () => {
      try {
        const doc = this.elements.webFrame.contentDocument;
        const btn = doc && doc.getElementById('openInNewTab');
        if (btn) btn.addEventListener('click', () => chrome.tabs.create({ url: cfg.url }));
      } catch {
        // ignore cross-origin issues
      }
    };
  }

  showLoadErrorMessage(siteKey) {
    const cfg = SITE_CONFIGS[siteKey];
    const errorHtml = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:20px;text-align:center;background:#f5f5f5;color:#333;font-family:-apple-system,sans-serif;">
        <div style="font-size:42px;margin-bottom:14px;">⚠️</div>
        <h3 style="margin-bottom:10px;color:#d32f2f;">Unable to load ${cfg.name}</h3>
        <p style="color:#666;margin-bottom:18px;max-width:340px;">
          The service might be unavailable or need login. Try opening it in a new tab first, then come back.
        </p>
        <div style="display:flex;gap:10px;">
          <button id="retryBtn" style="background:#1976d2;color:white;border:none;padding:10px 18px;border-radius:6px;cursor:pointer;font-size:13.5px;">Retry</button>
          <button id="openNewTabBtn" style="background:#666;color:white;border:none;padding:10px 18px;border-radius:6px;cursor:pointer;font-size:13.5px;">Open in New Tab</button>
        </div>
      </div>
    `;
    this.elements.webFrame.srcdoc = errorHtml;
    this.elements.webFrame.onload = () => {
      try {
        const doc = this.elements.webFrame.contentDocument;
        if (!doc) return;
        const retryBtn = doc.getElementById('retryBtn');
        const openNewTabBtn = doc.getElementById('openNewTabBtn');
        if (retryBtn) retryBtn.addEventListener('click', () => this.handleOptionClick(siteKey));
        if (openNewTabBtn) openNewTabBtn.addEventListener('click', () => chrome.tabs.create({ url: cfg.url }));
      } catch {
        // ignore cross-origin issues
      }
    };
  }

  // ------------------------------------------------------------------
  // State persistence
  // ------------------------------------------------------------------

  async loadSettings() {
    const { themePreference } = await this.loadSetting('themePreference', 'sync', 'system');
    this.themePreference = themePreference || 'system';
    this.applyTheme();

    const { geminiBlockEnabled } = await this.loadSetting('geminiBlockEnabled', 'sync', true);
    this.elements.toggleBlocker.checked = geminiBlockEnabled;

    const { geminiApiKey } = await this.loadSetting('geminiApiKey', 'local');
    if (geminiApiKey) this.apiKey = geminiApiKey;
  }

  async loadLastState() {
    const { lastSite } = await this.loadSetting('lastSite', 'local');
    // Restore the last viewed tab only if it's both a valid platform
    // AND still in the user's customised tab list. If the user removed
    // it from the tab bar in a previous session, fall back to Home so
    // we don't auto-add a removed tab back via the active-state.
    if (lastSite && SITE_CONFIGS[lastSite] && this.userTabOrder.includes(lastSite)) {
      this.handleOptionClick(lastSite);
    } else {
      this.showWelcomeScreen();
    }
  }

  async loadSetting(key, type = 'local', defaultValue = null) {
    try {
      const area = type === 'sync' ? chrome.storage.sync : chrome.storage.local;
      return await area.get({ [key]: defaultValue });
    } catch (err) {
      console.error(`Error loading setting ${key}:`, err);
      return { [key]: defaultValue };
    }
  }

  async saveSetting(key, value, type = 'local') {
    try {
      const area = type === 'sync' ? chrome.storage.sync : chrome.storage.local;
      await area.set({ [key]: value });
    } catch (err) {
      console.error(`Error saving setting ${key}:`, err);
    }
  }

  // ------------------------------------------------------------------
  // API key handling
  // ------------------------------------------------------------------

  async saveApiKey() {
    const newKey = this.elements.apiKeyInput.value.trim();
    if (!newKey) {
      alert('Please enter an API key.');
      return;
    }
    this.apiKey = newKey;
    await this.saveSetting('geminiApiKey', newKey, 'local');
    this.elements.apiKeyInput.value = '';
    this.showView('chatContainer', 'api');
  }

  // ------------------------------------------------------------------
  // Quick Chat (Gemini API)
  // ------------------------------------------------------------------

  async sendMessage() {
    if (this.isChatPending) return;

    const text = this.elements.messageInput.value.trim();
    if (!text) return;

    if (!this.apiKey) {
      this.showView('apiKeySetup', 'api');
      return;
    }

    this.elements.messageInput.value = '';
    this.autoResizeTextarea();
    this.updateSendButtonState();

    this.appendChatTurn({ role: 'user', text });

    this.isChatPending = true;
    this.updateSendButtonState();
    const typingEl = this.showTypingIndicator();

    let bubble = null;
    let contentEl = null;
    let fullText = '';

    const ensureBubble = () => {
      if (bubble) return;
      this.removeTypingIndicator(typingEl);
      bubble = this.renderMessage('model', '', { streaming: true });
      contentEl = bubble.querySelector('.content');
    };

    try {
      fullText = await this.callGeminiApiStream((chunkText) => {
        ensureBubble();
        contentEl.innerHTML = window.renderMarkdown(chunkText);
        this.maybeAutoScroll();
      });

      // Finalise: render one last time without the streaming cursor.
      ensureBubble();
      bubble.classList.remove('streaming');
      contentEl.innerHTML = window.renderMarkdown(fullText);
      this.scrollMessagesToBottom();

      // Persist the complete turn now that we have it all.
      this.chatHistory.push({ role: 'model', text: fullText });
      if (this.chatHistory.length > MAX_CHAT_HISTORY) {
        this.chatHistory = this.chatHistory.slice(-MAX_CHAT_HISTORY);
      }
      this.saveChatHistory();
    } catch (err) {
      this.removeTypingIndicator(typingEl);
      // If a bubble was created but the stream then failed, drop it so
      // we don't leave a half-finished assistant turn behind.
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      const message = this.formatApiError(err);
      this.renderMessage('error', message);
      console.error('Gemini API error:', err);
    } finally {
      this.isChatPending = false;
      this.updateSendButtonState();
      this.elements.messageInput.focus();
    }
  }

  async callGeminiApiStream(onChunk) {
    const url =
      `${GEMINI_API_BASE}/${GEMINI_MODEL}:streamGenerateContent` +
      `?alt=sse&key=${encodeURIComponent(this.apiKey)}`;

    const body = {
      contents: this.chatHistory.map((turn) => ({
        role: turn.role,
        parts: [{ text: turn.text }],
      })),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const err = new Error(`HTTP ${response.status}: ${response.statusText}`);
      err.status = response.status;
      err.body = errorText;
      throw err;
    }

    if (!response.body) {
      throw new Error('Streaming not supported by this browser.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    let blockReason = null;
    let finishReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE delimits events with blank lines. Each event contains one
      // or more `data:` lines; an event ends when we see a `\n\n`.
      let sepIdx;
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);

        const dataLines = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart());
        if (dataLines.length === 0) continue;

        const payload = dataLines.join('\n');
        if (!payload || payload === '[DONE]') continue;

        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        const candidate = parsed.candidates && parsed.candidates[0];
        if (candidate) {
          const parts = candidate.content && candidate.content.parts;
          if (Array.isArray(parts)) {
            for (const p of parts) {
              if (typeof p.text === 'string') fullText += p.text;
            }
          }
          if (candidate.finishReason) finishReason = candidate.finishReason;
        }
        if (parsed.promptFeedback && parsed.promptFeedback.blockReason) {
          blockReason = parsed.promptFeedback.blockReason;
        }

        if (fullText) onChunk(fullText);
      }
    }

    if (!fullText) {
      const detail = blockReason || finishReason || 'no content returned';
      throw new Error(`Empty response from Gemini (${detail})`);
    }

    return fullText;
  }

  formatApiError(err) {
    if (err && err.status === 400) {
      return 'Gemini rejected the request. Your API key might be invalid, or the request was malformed.';
    }
    if (err && err.status === 403) {
      return "Gemini denied the request (403). Check that the Generative Language API is enabled for your API key.";
    }
    if (err && err.status === 429) {
      return 'Rate limit reached. Wait a moment and try again.';
    }
    if (err && err.status >= 500) {
      return 'Gemini service error. Try again in a few seconds.';
    }
    if (err && err.message && err.message.startsWith('Empty response')) {
      return `${err.message}. This usually means the prompt was filtered for safety.`;
    }
    return `Request failed: ${err && err.message ? err.message : 'unknown error'}.`;
  }

  appendChatTurn(turn) {
    this.chatHistory.push(turn);
    if (this.chatHistory.length > MAX_CHAT_HISTORY) {
      this.chatHistory = this.chatHistory.slice(-MAX_CHAT_HISTORY);
    }
    this.renderMessage(turn.role, turn.text);
    this.saveChatHistory();
  }

  renderMessage(role, text, opts) {
    if (this.elements.messagesEmpty) this.elements.messagesEmpty.classList.add('hidden');

    const wrapper = document.createElement('div');
    const variant = role === 'user' ? 'user' : role === 'error' ? 'error' : 'assistant';
    wrapper.className = `message ${variant}`;
    if (opts && opts.streaming) wrapper.classList.add('streaming');

    const iconChar = role === 'user' ? '👤' : role === 'error' ? '!' : '✨';
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.textContent = iconChar;

    const content = document.createElement('div');
    content.className = 'content';

    // Markdown is rendered for assistant replies only. User and error
    // bubbles stay as plain text so we never let user input or our own
    // error strings interpret as HTML.
    if (role === 'model' && window.renderMarkdown) {
      content.innerHTML = window.renderMarkdown(text || '');
    } else {
      content.textContent = text;
    }

    wrapper.appendChild(icon);
    wrapper.appendChild(content);
    this.elements.messages.appendChild(wrapper);

    this.scrollMessagesToBottom();
    return wrapper;
  }

  showTypingIndicator() {
    const wrapper = document.createElement('div');
    wrapper.className = 'message assistant typing';

    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.textContent = '✨';

    const content = document.createElement('div');
    content.className = 'content';
    content.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';

    wrapper.appendChild(icon);
    wrapper.appendChild(content);
    this.elements.messages.appendChild(wrapper);
    this.scrollMessagesToBottom();
    return wrapper;
  }

  removeTypingIndicator(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  scrollMessagesToBottom() {
    const m = this.elements.messages;
    m.scrollTop = m.scrollHeight;
  }

  // Only stick the view to the bottom while the user is already there;
  // if they've scrolled up to read earlier content, leave them be.
  maybeAutoScroll() {
    const m = this.elements.messages;
    const threshold = 80;
    const atBottom = m.scrollHeight - m.scrollTop - m.clientHeight < threshold;
    if (atBottom) m.scrollTop = m.scrollHeight;
  }

  autoResizeTextarea() {
    const ta = this.elements.messageInput;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }

  updateSendButtonState() {
    const hasText = this.elements.messageInput.value.trim().length > 0;
    this.elements.sendBtn.disabled = !hasText || this.isChatPending;
  }

  confirmClearChatHistory() {
    if (this.chatHistory.length === 0) return;
    if (!window.confirm('Clear the entire Quick Chat conversation? This cannot be undone.')) return;
    this.clearChatHistory();
    this.closeSettings();
  }

  async clearChatHistory() {
    this.chatHistory = [];
    this.elements.messages.innerHTML = '';
    if (this.elements.messagesEmpty) {
      this.elements.messages.appendChild(this.elements.messagesEmpty);
      this.elements.messagesEmpty.classList.remove('hidden');
    }
    await this.saveSetting('chatHistory', [], 'local');
  }

  async loadChatHistory() {
    const { chatHistory } = await this.loadSetting('chatHistory', 'local', []);
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) return;

    this.chatHistory = chatHistory.filter(
      (turn) => turn && typeof turn.text === 'string' && (turn.role === 'user' || turn.role === 'model')
    );

    if (this.chatHistory.length === 0) return;

    if (this.elements.messagesEmpty) this.elements.messagesEmpty.classList.add('hidden');
    for (const turn of this.chatHistory) this.renderMessage(turn.role, turn.text);
  }

  async saveChatHistory() {
    await this.saveSetting('chatHistory', this.chatHistory, 'local');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AiChatHub();
});
