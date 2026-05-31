// compare-controller.js
//
// Renders the multi-AI "Compare" interface: a chip-style tabbar for
// managing which AIs are in the session, a sticky prompt bar, and a
// list of AI iframe panels that can each be collapsed, removed,
// reloaded, or opened in their own tab. The same class powers both
// the in-side-panel experience and the full-tab popout (compare.html).
//
// Communication with the AI iframes is via window.postMessage; each AI
// site has a content script (broadcast-injector.js) declared in the
// manifest which receives the prompt and clicks the site's send button.
// Sites without injector support get a "manual paste" copy badge.
//
// State:
//   - Panel roster persists to chrome.storage.local under
//     compareSessionV1 (so it survives reloads + syncs across views).
//   - Prompt text persists to chrome.storage.session (transient).
//
// Capacity: hard cap of MAX_PANELS to keep iframe memory bounded.

(function () {
  'use strict';

  const STORAGE_KEYS = {
    session: 'compareSessionV1',
    prompt: 'comparePrompt',
  };

  const MAX_PANELS = 8;
  const PANEL_LIMIT_MSG = `Compare supports up to ${MAX_PANELS} panels. Remove one to add another.`;

  // Initial roster seeded only if the user has NO stored compareSessionV1
  // AND no legacy compareSelectedSites. New users see an empty Compare
  // with an "Add your first AI" CTA - matching the empty tab bar UX.
  const EMPTY_DEFAULT_PANELS = [];

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  function generateInstanceId() {
    return 'c_' + Math.random().toString(36).slice(2, 10);
  }

  function getSiteConfig(siteKey) {
    const cfgs = window.SITE_CONFIGS || {};
    return cfgs[siteKey] || null;
  }

  function getSiteName(siteKey) {
    const cfg = getSiteConfig(siteKey);
    return cfg ? cfg.name : siteKey;
  }

  function getSiteIcon(siteKey) {
    const cfg = getSiteConfig(siteKey);
    return cfg ? (cfg.icon || '🔗') : '🔗';
  }

  function getSiteUrl(siteKey) {
    const cfg = getSiteConfig(siteKey);
    return cfg ? cfg.url : null;
  }

  function isBroadcastSupported(siteKey) {
    const set = window.BROADCAST_SUPPORTED_KEYS;
    return !!(set && set.has(siteKey));
  }

  // Computes the next auto-label for a same-model duplicate.
  // First instance has label=null (uses site default name); subsequent
  // ones get "Name (2)", "Name (3)", ..., skipping any in-use numbers
  // so we never collide if the user removes a middle instance.
  function nextInstanceLabel(siteKey, panels) {
    const baseName = getSiteName(siteKey);
    const sameSitePanels = panels.filter((p) => p.siteKey === siteKey);
    if (sameSitePanels.length === 0) return null; // first one - no suffix
    const usedNames = new Set(
      sameSitePanels.map((p) => p.label || baseName)
    );
    let n = 2;
    while (usedNames.has(`${baseName} (${n})`)) n++;
    return `${baseName} (${n})`;
  }

  function displayLabel(panel) {
    return panel.label || getSiteName(panel.siteKey);
  }

  // -------------------------------------------------------------------
  // CompareView
  // -------------------------------------------------------------------

  class CompareView {
    /**
     * @param {Object} opts
     * @param {HTMLElement} opts.root          Container element to render into.
     * @param {boolean}     opts.canPopout     Whether to show the popout button.
     * @param {Function}    [opts.onPopout]    Override popout behavior.
     * @param {Object}      [opts.promptLibrary] Shared PromptLibrary; else local.
     * @param {Function}    [opts.onManagePrompts] Callback for picker's "Manage" link.
     */
    constructor(opts) {
      this.root = opts.root;
      this.canPopout = !!opts.canPopout;
      this.onPopout = opts.onPopout;
      this.promptLibrary = opts.promptLibrary || (window.PromptLibrary ? new window.PromptLibrary() : null);
      this.onManagePrompts = opts.onManagePrompts;

      this.panels = [];        // array of { instanceId, siteKey, label, collapsed }
      this.iframes = {};       // instanceId -> HTMLIFrameElement
      this.statusEls = {};     // instanceId -> status display element
      this.readyStates = {};   // instanceId -> 'loading' | 'ready' | 'not-found'
      this.lastSent = {};      // instanceId -> { ok, error?, at }
      this.broadcasting = false;
      this.promptPicker = null;
      this.addPickerOpen = false;
      this.dragInstanceId = null;
      this._suppressStorageEcho = false;

      this.handleMessage = this.handleMessage.bind(this);
      this.handleStorageChange = this.handleStorageChange.bind(this);
      this.handleDocumentClick = this.handleDocumentClick.bind(this);
      window.addEventListener('message', this.handleMessage);
      chrome.storage.onChanged.addListener(this.handleStorageChange);
      document.addEventListener('click', this.handleDocumentClick);
    }

    async init() {
      this.buildSkeleton();
      await this.restorePanels();
      await this.restorePrompt();
      this.renderPanels();
      this.attachListeners();
      this.refreshSendButtonState();

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
        this.pickerBtn.classList.add('hidden');
      }
    }

    // ----------------------------------------------------------------
    // Skeleton
    // ----------------------------------------------------------------

    buildSkeleton() {
      this.root.innerHTML = '';
      this.root.classList.add('compare-root');

      this.root.appendChild(this.buildPromptBar());
      this.root.appendChild(this.buildTabbar());
      this.root.appendChild(this.buildPanelList());
      this.root.appendChild(this.buildEmptyState());
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
      textarea.placeholder = 'Send a prompt to all AIs (Enter to send, Shift+Enter for newline)';
      textarea.rows = 1;
      this.promptInput = textarea;

      const sendBtn = document.createElement('button');
      sendBtn.id = 'compareSendBtn';
      sendBtn.title = 'Send to every visible panel';
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

    buildTabbar() {
      const bar = document.createElement('div');
      bar.className = 'compare-tabbar';
      bar.id = 'compareTabbar';

      const chips = document.createElement('div');
      chips.className = 'compare-tabbar-chips';
      bar.appendChild(chips);
      this.tabbarChipsEl = chips;

      const addBtn = document.createElement('button');
      addBtn.className = 'compare-tabbar-add';
      addBtn.title = `Add an AI to compare (max ${MAX_PANELS})`;
      addBtn.textContent = '+';
      bar.appendChild(addBtn);
      this.addBtn = addBtn;

      const popover = document.createElement('div');
      popover.className = 'compare-add-popover hidden';
      bar.appendChild(popover);
      this.addPopoverEl = popover;

      return bar;
    }

    buildPanelList() {
      const list = document.createElement('div');
      list.className = 'compare-panel-list';
      this.panelListEl = list;
      return list;
    }

    buildEmptyState() {
      const empty = document.createElement('div');
      empty.className = 'compare-empty hidden';

      const heading = document.createElement('h3');
      heading.className = 'compare-empty-heading';
      heading.textContent = 'Pick your first AI to compare';

      const sub = document.createElement('p');
      sub.className = 'compare-empty-sub';
      sub.textContent = 'Add up to ' + MAX_PANELS + ' AI panels (including duplicates of the same model for A/B prompt testing).';

      const cta = document.createElement('button');
      cta.className = 'compare-empty-cta';
      cta.textContent = '+ Add an AI';
      cta.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleAddPopover(true);
      });

      empty.appendChild(heading);
      empty.appendChild(sub);
      empty.appendChild(cta);
      this.emptyStateEl = empty;
      return empty;
    }

    // ----------------------------------------------------------------
    // Rendering: tabbar + panels + empty state
    // ----------------------------------------------------------------

    renderAll() {
      this.renderPanels();
    }

    // Reconciles DOM with this.panels. Adds new panels, removes gone
    // ones, reorders survivors, and updates label/collapsed state.
    renderPanels() {
      this.renderTabbar();

      const list = this.panelListEl;
      const wantedIds = new Set(this.panels.map((p) => p.instanceId));

      // Remove panels no longer in the roster.
      Array.from(list.children).forEach((child) => {
        const id = child.dataset.instanceId;
        if (!wantedIds.has(id)) {
          list.removeChild(child);
          delete this.iframes[id];
          delete this.statusEls[id];
          delete this.readyStates[id];
          delete this.lastSent[id];
        }
      });

      // Add / reorder.
      this.panels.forEach((panel, idx) => {
        let el = list.querySelector(`[data-instance-id="${panel.instanceId}"]`);
        if (!el) {
          el = this.buildPanel(panel);
          list.appendChild(el);
        }
        // Reorder: if this panel's current DOM index doesn't match,
        // move it into place. children[idx] points at whatever's
        // currently in slot idx, so insertBefore is the move.
        if (list.children[idx] !== el) {
          list.insertBefore(el, list.children[idx] || null);
        }
        // Sync state.
        el.classList.toggle('collapsed', !!panel.collapsed);
        const collapseBtn = el.querySelector('[data-action="collapse"]');
        if (collapseBtn) collapseBtn.textContent = panel.collapsed ? '▸' : '▾';
        const titleEl = el.querySelector('.compare-panel-title');
        if (titleEl) {
          titleEl.innerHTML = '';
          const iconSpan = document.createElement('span');
          iconSpan.className = 'compare-panel-icon';
          iconSpan.textContent = getSiteIcon(panel.siteKey);
          titleEl.appendChild(iconSpan);
          titleEl.append(' ' + displayLabel(panel));
        }
      });

      this.updateEmptyState();
      this.refreshSendButtonState();
    }

    renderTabbar() {
      const chips = this.tabbarChipsEl;
      chips.innerHTML = '';

      this.panels.forEach((panel) => {
        const chip = document.createElement('div');
        chip.className = 'compare-chip';
        chip.dataset.instanceId = panel.instanceId;
        chip.draggable = true;
        if (panel.collapsed) chip.classList.add('collapsed');
        if (!isBroadcastSupported(panel.siteKey)) chip.classList.add('manual-only');

        const icon = document.createElement('span');
        icon.className = 'compare-chip-icon';
        icon.textContent = getSiteIcon(panel.siteKey);
        chip.appendChild(icon);

        const label = document.createElement('span');
        label.className = 'compare-chip-label';
        label.textContent = displayLabel(panel);
        chip.appendChild(label);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'compare-chip-remove';
        removeBtn.title = 'Remove this panel';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removePanel(panel.instanceId);
        });
        chip.appendChild(removeBtn);

        chip.addEventListener('click', () => this.scrollToPanel(panel.instanceId));
        this.attachChipDragHandlers(chip);
        chips.appendChild(chip);
      });

      // Hide the + button (visually disable) at the cap, but keep it
      // clickable so the user gets a clear message.
      this.addBtn.classList.toggle('at-capacity', this.panels.length >= MAX_PANELS);
    }

    buildPanel(panel) {
      const section = document.createElement('section');
      section.className = 'compare-panel';
      section.dataset.instanceId = panel.instanceId;
      section.dataset.siteKey = panel.siteKey;

      // ---- Header
      const header = document.createElement('div');
      header.className = 'compare-panel-header';

      const title = document.createElement('span');
      title.className = 'compare-panel-title';
      const iconSpan = document.createElement('span');
      iconSpan.className = 'compare-panel-icon';
      iconSpan.textContent = getSiteIcon(panel.siteKey);
      title.appendChild(iconSpan);
      title.append(' ' + displayLabel(panel));

      const status = document.createElement('span');
      status.className = 'compare-panel-status';
      status.textContent = 'Loading…';
      this.statusEls[panel.instanceId] = status;

      // Manual-paste badge for AIs the broadcast-injector can't drive.
      if (!isBroadcastSupported(panel.siteKey)) {
        const badge = document.createElement('span');
        badge.className = 'compare-panel-badge';
        badge.title = "Auto-send isn't supported for this AI yet. Use Copy to paste manually.";
        badge.textContent = 'manual';
        title.appendChild(badge);
      }

      const actions = document.createElement('div');
      actions.className = 'compare-panel-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'compare-icon-btn';
      copyBtn.title = 'Copy current prompt (useful when auto-send is unsupported)';
      copyBtn.textContent = '📋';
      copyBtn.addEventListener('click', () => this.copyPromptForPanel(panel.instanceId));

      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'compare-icon-btn';
      collapseBtn.dataset.action = 'collapse';
      collapseBtn.title = 'Collapse / expand panel body';
      collapseBtn.textContent = panel.collapsed ? '▸' : '▾';
      collapseBtn.addEventListener('click', () => this.toggleCollapse(panel.instanceId));

      const reloadBtn = document.createElement('button');
      reloadBtn.className = 'compare-icon-btn';
      reloadBtn.title = 'Reload this AI';
      reloadBtn.textContent = '↻';
      reloadBtn.addEventListener('click', () => this.reloadPanel(panel.instanceId));

      const openTabBtn = document.createElement('button');
      openTabBtn.className = 'compare-icon-btn';
      openTabBtn.title = 'Open this AI in a new browser tab';
      openTabBtn.textContent = '↗';
      openTabBtn.addEventListener('click', () => {
        const url = getSiteUrl(panel.siteKey);
        if (url) chrome.tabs.create({ url });
      });

      const closeBtn = document.createElement('button');
      closeBtn.className = 'compare-icon-btn compare-icon-btn-danger';
      closeBtn.title = 'Remove this panel from Compare';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', () => this.removePanel(panel.instanceId));

      actions.appendChild(copyBtn);
      actions.appendChild(collapseBtn);
      actions.appendChild(reloadBtn);
      actions.appendChild(openTabBtn);
      actions.appendChild(closeBtn);

      header.appendChild(title);
      header.appendChild(status);
      header.appendChild(actions);

      // ---- Body
      const body = document.createElement('div');
      body.className = 'compare-panel-body';

      const url = getSiteUrl(panel.siteKey);
      if (url) {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
        this.iframes[panel.instanceId] = iframe;
        this.readyStates[panel.instanceId] = 'loading';
        body.appendChild(iframe);
      } else {
        // Site removed from SITE_CONFIGS (e.g. custom platform deleted).
        const note = document.createElement('div');
        note.className = 'compare-panel-orphan';
        note.textContent = 'This platform is no longer available. Remove this panel.';
        body.appendChild(note);
        this.setStatus(panel.instanceId, 'Orphaned', 'error');
      }

      section.appendChild(header);
      section.appendChild(body);

      if (panel.collapsed) section.classList.add('collapsed');
      return section;
    }

    updateEmptyState() {
      const empty = !this.panels.length;
      this.emptyStateEl.classList.toggle('hidden', !empty);
      this.panelListEl.classList.toggle('hidden', empty);
    }

    // ----------------------------------------------------------------
    // Listeners
    // ----------------------------------------------------------------

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

      this.addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleAddPopover();
      });
    }

    handleDocumentClick(e) {
      if (!this.addPickerOpen) return;
      if (this.addPopoverEl.contains(e.target)) return;
      if (this.addBtn.contains(e.target)) return;
      this.toggleAddPopover(false);
    }

    autoResizePromptInput() {
      const ta = this.promptInput;
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    }

    refreshSendButtonState() {
      const text = this.promptInput.value.trim();
      const anyVisible = this.panels.some((p) => !p.collapsed && getSiteUrl(p.siteKey));
      this.sendBtn.disabled = !text || !anyVisible || this.broadcasting;
    }

    // ----------------------------------------------------------------
    // + popover: add a panel
    // ----------------------------------------------------------------

    toggleAddPopover(force) {
      const next = typeof force === 'boolean' ? force : !this.addPickerOpen;
      if (next === this.addPickerOpen) return;
      this.addPickerOpen = next;
      if (next) {
        this.renderAddPopover();
        this.addPopoverEl.classList.remove('hidden');
      } else {
        this.addPopoverEl.classList.add('hidden');
      }
    }

    renderAddPopover() {
      const pop = this.addPopoverEl;
      pop.innerHTML = '';

      const cfgs = window.SITE_CONFIGS || {};
      const regionOrder = window.REGION_ORDER || ['international', 'chinese'];
      const regionLabels = window.REGION_LABELS || {};

      // Cap notice
      if (this.panels.length >= MAX_PANELS) {
        const note = document.createElement('div');
        note.className = 'compare-add-cap-notice';
        note.textContent = PANEL_LIMIT_MSG;
        pop.appendChild(note);
        return;
      }

      // Header
      const head = document.createElement('div');
      head.className = 'compare-add-head';
      head.textContent = 'Add an AI to Compare';
      pop.appendChild(head);

      // Group by region
      const grouped = {};
      const customs = [];
      for (const [key, cfg] of Object.entries(cfgs)) {
        if (!cfg) continue;
        if (cfg.kind !== 'web') continue; // Quick Chat / Compare excluded
        if (key.startsWith('custom_')) {
          customs.push(key);
          continue;
        }
        const region = cfg.region || 'international';
        if (!grouped[region]) grouped[region] = [];
        grouped[region].push(key);
      }

      for (const region of regionOrder) {
        if (!grouped[region] || !grouped[region].length) continue;
        this.appendAddSection(pop, regionLabels[region] || region, grouped[region].sort((a, b) => getSiteName(a).localeCompare(getSiteName(b))));
      }

      // Custom platforms section (if any)
      if (customs.length) {
        this.appendAddSection(pop, 'Your custom platforms', customs);
      } else {
        const hint = document.createElement('div');
        hint.className = 'compare-add-hint';
        hint.textContent = 'Need a custom URL? Add one via + in the main tab bar.';
        pop.appendChild(hint);
      }
    }

    appendAddSection(parent, label, keys) {
      const heading = document.createElement('div');
      heading.className = 'compare-add-section-heading';
      heading.textContent = label;
      parent.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'compare-add-grid';
      for (const key of keys) {
        const item = document.createElement('button');
        item.className = 'compare-add-item';
        item.title = isBroadcastSupported(key)
          ? `Add ${getSiteName(key)}`
          : `Add ${getSiteName(key)} (auto-send not supported - manual paste only)`;

        const icon = document.createElement('span');
        icon.className = 'compare-add-icon';
        icon.textContent = getSiteIcon(key);
        item.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'compare-add-name';
        name.textContent = getSiteName(key);
        item.appendChild(name);

        // Count existing instances of this AI, with badge.
        const existing = this.panels.filter((p) => p.siteKey === key).length;
        if (existing > 0) {
          const badge = document.createElement('span');
          badge.className = 'compare-add-count';
          badge.textContent = `${existing}`;
          badge.title = `${existing} instance${existing > 1 ? 's' : ''} already in Compare`;
          item.appendChild(badge);
        }

        if (!isBroadcastSupported(key)) {
          item.classList.add('manual-only');
        }

        item.addEventListener('click', () => {
          this.addPanel(key);
          this.toggleAddPopover(false);
        });
        grid.appendChild(item);
      }
      parent.appendChild(grid);
    }

    // ----------------------------------------------------------------
    // Mutations: add / remove / collapse / reorder
    // ----------------------------------------------------------------

    async addPanel(siteKey) {
      if (this.panels.length >= MAX_PANELS) {
        this.setTabbarTransientMsg(PANEL_LIMIT_MSG);
        return;
      }
      const cfg = getSiteConfig(siteKey);
      if (!cfg) {
        this.setTabbarTransientMsg('That platform is no longer available.');
        return;
      }
      const label = nextInstanceLabel(siteKey, this.panels);
      this.panels.push({
        instanceId: generateInstanceId(),
        siteKey,
        label,
        collapsed: false,
      });
      this.renderPanels();
      await this.persistPanels();
    }

    async removePanel(instanceId) {
      const idx = this.panels.findIndex((p) => p.instanceId === instanceId);
      if (idx < 0) return;
      this.panels.splice(idx, 1);
      this.renderPanels();
      await this.persistPanels();
    }

    async toggleCollapse(instanceId) {
      const p = this.panels.find((x) => x.instanceId === instanceId);
      if (!p) return;
      p.collapsed = !p.collapsed;
      this.renderPanels();
      await this.persistPanels();
    }

    scrollToPanel(instanceId) {
      const el = this.panelListEl.querySelector(`[data-instance-id="${instanceId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }

    setTabbarTransientMsg(msg) {
      // Minimal toast that doesn't depend on a global toast system.
      let toast = this.root.querySelector('.compare-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.className = 'compare-toast';
        this.root.appendChild(toast);
      }
      toast.textContent = msg;
      toast.classList.add('visible');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
    }

    // ----- Drag-reorder (HTML5 native DnD on tabbar chips) -----------

    attachChipDragHandlers(chip) {
      chip.addEventListener('dragstart', (e) => {
        this.dragInstanceId = chip.dataset.instanceId;
        chip.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', this.dragInstanceId); } catch {}
        e.dataTransfer.effectAllowed = 'move';
      });
      chip.addEventListener('dragend', () => {
        chip.classList.remove('dragging');
        this.dragInstanceId = null;
      });
      chip.addEventListener('dragover', (e) => {
        if (!this.dragInstanceId || this.dragInstanceId === chip.dataset.instanceId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      chip.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!this.dragInstanceId || this.dragInstanceId === chip.dataset.instanceId) return;
        const from = this.panels.findIndex((p) => p.instanceId === this.dragInstanceId);
        const to = this.panels.findIndex((p) => p.instanceId === chip.dataset.instanceId);
        if (from < 0 || to < 0) return;
        const [moved] = this.panels.splice(from, 1);
        this.panels.splice(to, 0, moved);
        this.renderPanels();
        await this.persistPanels();
      });
    }

    // ----------------------------------------------------------------
    // Broadcast
    // ----------------------------------------------------------------

    async broadcast() {
      if (this.broadcasting) return;
      const text = this.promptInput.value.trim();
      if (!text) return;

      // Targets = visible (non-collapsed) panels that have an iframe.
      const targets = this.panels.filter(
        (p) => !p.collapsed && this.iframes[p.instanceId]
      );
      if (targets.length === 0) return;

      this.broadcasting = true;
      this.refreshSendButtonState();

      for (const p of targets) {
        this.setStatus(p.instanceId, 'Sending…', 'pending');
      }

      for (const p of targets) {
        if (!isBroadcastSupported(p.siteKey)) {
          // No injector for this AI. Surface a clear hint.
          this.setStatus(
            p.instanceId,
            'Manual paste required — use 📋',
            'warn'
          );
          continue;
        }
        const iframe = this.iframes[p.instanceId];
        try {
          iframe.contentWindow.postMessage({ type: 'CHATHUB_SEND_PROMPT', text }, '*');
        } catch (err) {
          this.setStatus(p.instanceId, `Send failed: ${err.message}`, 'error');
        }
      }

      // Optimistically clear the prompt - users typically don't want
      // to re-send the same prompt by accident.
      this.promptInput.value = '';
      this.autoResizePromptInput();
      this.persistPrompt();

      this.broadcasting = false;
      this.refreshSendButtonState();
    }

    setStatus(instanceId, text, kind) {
      const el = this.statusEls[instanceId];
      if (!el) return;
      el.textContent = text;
      el.dataset.kind = kind || '';
    }

    async copyPromptForPanel(instanceId) {
      const text = this.promptInput.value.trim();
      if (!text) {
        this.setStatus(instanceId, 'Type a prompt first', 'warn');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        this.setStatus(instanceId, 'Prompt copied — paste in the iframe', 'ok');
      } catch (err) {
        this.setStatus(instanceId, `Copy failed: ${err.message}`, 'error');
      }
    }

    reloadPanel(instanceId) {
      const p = this.panels.find((x) => x.instanceId === instanceId);
      if (!p) return;
      const url = getSiteUrl(p.siteKey);
      const iframe = this.iframes[instanceId];
      if (!url || !iframe) return;
      this.readyStates[instanceId] = 'loading';
      this.setStatus(instanceId, 'Loading…', 'pending');
      iframe.src = url;
    }

    // ----------------------------------------------------------------
    // Iframe message handling
    // ----------------------------------------------------------------

    handleMessage(event) {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      let instanceId = null;
      for (const [id, iframe] of Object.entries(this.iframes)) {
        if (iframe.contentWindow === event.source) {
          instanceId = id;
          break;
        }
      }
      if (!instanceId) return;

      if (msg.type === 'CHATHUB_READY') {
        this.readyStates[instanceId] = msg.found === false ? 'not-found' : 'ready';
        if (msg.found === false) {
          this.setStatus(instanceId, 'Ready (input not auto-detected)', 'warn');
        } else {
          this.setStatus(instanceId, 'Ready', 'ok');
        }
      } else if (msg.type === 'CHATHUB_RESULT') {
        if (msg.ok) {
          this.lastSent[instanceId] = { ok: true, at: Date.now() };
          this.setStatus(instanceId, '✓ Sent', 'ok');
        } else {
          this.lastSent[instanceId] = { ok: false, error: msg.error, at: Date.now() };
          this.setStatus(instanceId, `✗ ${msg.error || 'failed'}`, 'error');
        }
      }
    }

    // ----------------------------------------------------------------
    // Pop-out
    // ----------------------------------------------------------------

    async handlePopout() {
      // Persist current state so the popout sees identical roster.
      await this.persistPrompt();
      await this.persistPanels();
      if (typeof this.onPopout === 'function') {
        this.onPopout();
        return;
      }
      chrome.tabs.create({ url: chrome.runtime.getURL('compare.html') });
    }

    // ----------------------------------------------------------------
    // State persistence (chrome.storage.local + onChanged sync)
    // ----------------------------------------------------------------

    async persistPanels() {
      try {
        this._suppressStorageEcho = true;
        await chrome.storage.local.set({
          [STORAGE_KEYS.session]: { panels: this.panels },
        });
      } catch {}
      finally {
        // Release on next tick - onChanged fires async after set().
        setTimeout(() => { this._suppressStorageEcho = false; }, 0);
      }
    }

    async persistPrompt() {
      try {
        await chrome.storage.session.set({ [STORAGE_KEYS.prompt]: this.promptInput.value });
      } catch {}
    }

    async restorePrompt() {
      try {
        const stored = await chrome.storage.session.get([STORAGE_KEYS.prompt]);
        if (typeof stored[STORAGE_KEYS.prompt] === 'string') {
          this.promptInput.value = stored[STORAGE_KEYS.prompt];
          this.autoResizePromptInput();
        }
      } catch {}
    }

    // Loads panel roster with migration from any of:
    //   1. New format (compareSessionV1.panels[])
    //   2. Legacy compareSelectedSites (just site keys, no instance ids)
    //   3. First-run (no storage at all) - empty roster
    async restorePanels() {
      try {
        const stored = await chrome.storage.local.get([STORAGE_KEYS.session]);
        const session = stored[STORAGE_KEYS.session];
        if (session && Array.isArray(session.panels)) {
          this.panels = session.panels
            .map((p) => this.normalisePanel(p))
            .filter(Boolean);
          // Defensive prune for now-missing platforms (e.g. user
          // removed a custom platform that was in Compare).
          this.panels = this.panels.filter((p) => !!getSiteConfig(p.siteKey));
          return;
        }
      } catch {}

      // Migration path: legacy compareSelectedSites + default 5.
      try {
        const legacy = await chrome.storage.session.get(['compareSelectedSites']);
        const sel = Array.isArray(legacy.compareSelectedSites) ? legacy.compareSelectedSites : null;
        if (sel) {
          const defaultFive = ['gemini', 'chatgpt', 'claude', 'perplexity', 'deepseek'];
          const ordered = defaultFive.filter((k) => sel.includes(k));
          this.panels = ordered.map((siteKey) => ({
            instanceId: generateInstanceId(),
            siteKey,
            label: null,
            collapsed: false,
          }));
          // Persist as new shape so this branch never runs again.
          if (this.panels.length) await this.persistPanels();
          return;
        }
      } catch {}

      // First-run default.
      this.panels = EMPTY_DEFAULT_PANELS.slice();
    }

    normalisePanel(raw) {
      if (!raw || typeof raw !== 'object') return null;
      if (!raw.siteKey || typeof raw.siteKey !== 'string') return null;
      return {
        instanceId: typeof raw.instanceId === 'string' && raw.instanceId
          ? raw.instanceId
          : generateInstanceId(),
        siteKey: raw.siteKey,
        label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 60) : null,
        collapsed: !!raw.collapsed,
      };
    }

    // Cross-view sync: if the same user has the side panel and the
    // popout open simultaneously, mutations in one propagate to the
    // other through chrome.storage.onChanged.
    handleStorageChange(changes, area) {
      if (area !== 'local') return;
      if (this._suppressStorageEcho) return;
      const change = changes[STORAGE_KEYS.session];
      if (!change) return;
      const next = change.newValue;
      if (!next || !Array.isArray(next.panels)) return;
      const normalised = next.panels.map((p) => this.normalisePanel(p)).filter(Boolean);
      // Avoid an infinite loop if the new state is byte-identical.
      if (JSON.stringify(normalised) === JSON.stringify(this.panels)) return;
      this.panels = normalised;
      this.renderPanels();
    }

    destroy() {
      window.removeEventListener('message', this.handleMessage);
      document.removeEventListener('click', this.handleDocumentClick);
      try { chrome.storage.onChanged.removeListener(this.handleStorageChange); } catch {}
      if (this.promptPicker) this.promptPicker.destroy();
      clearTimeout(this._toastTimer);
      this.root.innerHTML = '';
    }
  }

  // Expose globally for the host pages.
  window.CompareView = CompareView;
  window.CompareView.MAX_PANELS = MAX_PANELS;
})();
