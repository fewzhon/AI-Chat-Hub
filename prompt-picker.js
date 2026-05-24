// prompt-picker.js
//
// UI component that attaches a popover to an anchor button. When clicked,
// the popover shows a searchable list of saved prompts; clicking one
// inserts its body into the bound target input element. A "Manage..."
// link at the bottom invokes an optional callback (used by the side
// panel to navigate to the management view).
//
// Reusable in any extension page that has a global PromptLibrary class.
// Styles are loaded from the host page; the component creates a single
// .prompt-popover element rooted at <body>.

(function () {
  // Variable placeholder syntax: {{name}} where name = [\w-]+.
  // We allow optional surrounding whitespace inside the braces so a
  // human-friendly `{{ topic }}` works the same as `{{topic}}`.
  const VARIABLE_RE = /\{\{\s*([\w-]+)\s*\}\}/g;

  function extractVariables(body) {
    const seen = new Set();
    const order = [];
    let match;
    VARIABLE_RE.lastIndex = 0;
    while ((match = VARIABLE_RE.exec(body)) !== null) {
      const name = match[1];
      if (!seen.has(name)) {
        seen.add(name);
        order.push(name);
      }
    }
    return order;
  }

  function substituteVariables(body, values) {
    return body.replace(VARIABLE_RE, (full, name) => {
      const replacement = values[name];
      // Preserve the literal placeholder if the user left a field blank
      // OR if the variable name wasn't in the form (defensive).
      if (replacement === undefined || replacement === '') return full;
      return replacement;
    });
  }

  class PromptPicker {
    /**
     * @param {Object}            opts
     * @param {HTMLElement}       opts.anchorBtn   Button that toggles the popover.
     * @param {HTMLTextAreaElement|HTMLInputElement} opts.targetInput Where to insert.
     * @param {PromptLibrary}     opts.library     Library instance.
     * @param {Function}          [opts.onManageClick] Optional handler for the "Manage..." link.
     */
    constructor(opts) {
      this.anchorBtn = opts.anchorBtn;
      this.targetInput = opts.targetInput;
      this.library = opts.library;
      this.onManageClick = opts.onManageClick;

      this.popover = null;
      this.isOpen = false;
      this.searchTerm = '';
      this.mode = 'list'; // 'list' | 'variables'
      this.pendingPrompt = null;
      this.pendingVariables = [];

      this.unsubscribe = this.library.subscribe(() => {
        if (this.isOpen) this.renderList();
      });

      this.anchorBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      });

      this.handleDocClick = this.handleDocClick.bind(this);
      this.handleKey = this.handleKey.bind(this);
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.mode = 'list';
      this.pendingPrompt = null;
      this.pendingVariables = [];
      this.popover = this.buildPopover();
      document.body.appendChild(this.popover);
      this.positionPopover();
      this.renderList();
      const searchInput = this.popover.querySelector('.prompt-popover-search');
      if (searchInput) searchInput.focus();

      // Defer attachment so the click that opened us doesn't immediately close it.
      setTimeout(() => {
        document.addEventListener('mousedown', this.handleDocClick);
        document.addEventListener('keydown', this.handleKey);
      }, 0);

      this.anchorBtn.classList.add('is-open');
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      if (this.popover) this.popover.remove();
      this.popover = null;
      this.mode = 'list';
      this.pendingPrompt = null;
      this.pendingVariables = [];
      document.removeEventListener('mousedown', this.handleDocClick);
      document.removeEventListener('keydown', this.handleKey);
      this.anchorBtn.classList.remove('is-open');
    }

    handleDocClick(event) {
      if (!this.popover) return;
      if (this.popover.contains(event.target)) return;
      if (this.anchorBtn.contains(event.target)) return;
      this.close();
    }

    handleKey(event) {
      if (event.key !== 'Escape') return;
      // Inside the variables form, Esc backs out to the list rather than
      // closing the whole picker, so users don't lose their search.
      if (this.mode === 'variables') {
        this.switchToListMode();
      } else {
        this.close();
        this.anchorBtn.focus();
      }
    }

    buildPopover() {
      const popover = document.createElement('div');
      popover.className = 'prompt-popover';
      // Mounted twice: a list section (search + items + manage link) and
      // a variables-form section that swaps in when a placeholder-using
      // prompt is selected. We toggle visibility by .hidden class so
      // typed search state survives a quick detour into the form.

      // List mode UI.
      const list = document.createElement('div');
      list.className = 'prompt-popover-mode prompt-popover-mode-list';

      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'prompt-popover-search';
      search.placeholder = 'Search prompts...';
      search.value = this.searchTerm;
      search.addEventListener('input', () => {
        this.searchTerm = search.value;
        this.renderList();
      });

      const listBody = document.createElement('div');
      listBody.className = 'prompt-popover-list';

      const footer = document.createElement('div');
      footer.className = 'prompt-popover-footer';

      const manageLink = document.createElement('button');
      manageLink.className = 'prompt-popover-manage';
      manageLink.textContent = '⚙ Manage prompts...';
      manageLink.addEventListener('click', () => {
        this.close();
        if (typeof this.onManageClick === 'function') this.onManageClick();
      });
      footer.appendChild(manageLink);

      list.appendChild(search);
      list.appendChild(listBody);
      list.appendChild(footer);

      // Variables mode UI (built empty; populated by showVariableForm).
      const variables = document.createElement('div');
      variables.className = 'prompt-popover-mode prompt-popover-mode-variables hidden';

      popover.appendChild(list);
      popover.appendChild(variables);
      return popover;
    }

    positionPopover() {
      if (!this.popover) return;
      const rect = this.anchorBtn.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const popoverHeight = 320; // matches CSS max-height + chrome.
      const wantsAbove = rect.top > popoverHeight + 16;
      const top = wantsAbove ? rect.top - popoverHeight - 6 : rect.bottom + 6;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 320 - 8));
      this.popover.style.position = 'fixed';
      this.popover.style.top = `${Math.max(8, top)}px`;
      this.popover.style.left = `${left}px`;
      this.popover.style.width = '320px';
      this.popover.style.maxHeight = `${popoverHeight}px`;
    }

    renderList() {
      if (!this.popover) return;
      const list = this.popover.querySelector('.prompt-popover-list');
      list.innerHTML = '';

      const term = this.searchTerm.trim().toLowerCase();
      const matches = this.library.getAll().filter((p) => {
        if (!term) return true;
        return p.title.toLowerCase().includes(term) || p.body.toLowerCase().includes(term);
      });

      if (matches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'prompt-popover-empty';
        empty.textContent = term
          ? `No prompts match "${this.searchTerm}".`
          : 'No saved prompts yet.';
        list.appendChild(empty);
        return;
      }

      for (const prompt of matches) {
        const item = document.createElement('button');
        item.className = 'prompt-popover-item';
        item.dataset.id = prompt.id;

        const titleEl = document.createElement('div');
        titleEl.className = 'prompt-popover-item-title';
        titleEl.textContent = prompt.title;

        // Show a ⟨…⟩ badge next to titles that contain placeholders so
        // users can see at a glance which prompts will ask for input.
        const vars = extractVariables(prompt.body);
        if (vars.length > 0) {
          const badge = document.createElement('span');
          badge.className = 'prompt-popover-item-badge';
          badge.textContent = `⟨${vars.length} field${vars.length === 1 ? '' : 's'}⟩`;
          badge.title = `Variables: ${vars.join(', ')}`;
          titleEl.appendChild(badge);
        }

        const bodyEl = document.createElement('div');
        bodyEl.className = 'prompt-popover-item-body';
        bodyEl.textContent = this.truncate(prompt.body);

        item.appendChild(titleEl);
        item.appendChild(bodyEl);

        item.addEventListener('click', () => this.selectPrompt(prompt));
        list.appendChild(item);
      }
    }

    selectPrompt(prompt) {
      const vars = extractVariables(prompt.body);
      if (vars.length === 0) {
        this.applyPromptText(prompt.body);
        this.close();
        return;
      }
      this.pendingPrompt = prompt;
      this.pendingVariables = vars;
      this.showVariableForm();
    }

    showVariableForm() {
      if (!this.popover || !this.pendingPrompt) return;
      this.mode = 'variables';

      const listMode = this.popover.querySelector('.prompt-popover-mode-list');
      const formMode = this.popover.querySelector('.prompt-popover-mode-variables');
      listMode.classList.add('hidden');
      formMode.classList.remove('hidden');
      formMode.innerHTML = '';

      const header = document.createElement('div');
      header.className = 'prompt-popover-var-header';
      const title = document.createElement('div');
      title.className = 'prompt-popover-var-title';
      title.textContent = this.pendingPrompt.title;
      header.appendChild(title);
      formMode.appendChild(header);

      const fields = document.createElement('div');
      fields.className = 'prompt-popover-var-fields';
      const inputs = [];

      this.pendingVariables.forEach((name, idx) => {
        const row = document.createElement('div');
        row.className = 'prompt-popover-var-row';

        const label = document.createElement('label');
        label.className = 'prompt-popover-var-label';
        label.textContent = name;

        const input = document.createElement('textarea');
        input.className = 'prompt-popover-var-input';
        input.rows = 1;
        input.placeholder = `Value for {{${name}}}`;
        input.dataset.varName = name;
        input.addEventListener('input', () => this.autoSizeVarInput(input));
        input.addEventListener('keydown', (e) => this.handleVarKey(e, inputs, idx));
        inputs.push(input);

        row.appendChild(label);
        row.appendChild(input);
        fields.appendChild(row);
      });

      formMode.appendChild(fields);

      const actions = document.createElement('div');
      actions.className = 'prompt-popover-var-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'prompt-popover-var-cancel';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => this.switchToListMode());

      const insertBtn = document.createElement('button');
      insertBtn.className = 'prompt-popover-var-insert';
      insertBtn.textContent = 'Insert';
      insertBtn.addEventListener('click', () => this.submitVariableForm(inputs));

      actions.appendChild(cancelBtn);
      actions.appendChild(insertBtn);
      formMode.appendChild(actions);

      this.positionPopover();
      if (inputs.length > 0) inputs[0].focus();
    }

    autoSizeVarInput(input) {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    }

    // Enter on the last field submits; Enter on intermediate fields
    // jumps to the next input. Shift+Enter always inserts a newline.
    handleVarKey(event, inputs, idx) {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      if (idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      } else {
        this.submitVariableForm(inputs);
      }
    }

    submitVariableForm(inputs) {
      if (!this.pendingPrompt) return;
      const values = {};
      for (const input of inputs) values[input.dataset.varName] = input.value;
      const resolved = substituteVariables(this.pendingPrompt.body, values);
      this.applyPromptText(resolved);
      this.close();
    }

    switchToListMode() {
      if (!this.popover) return;
      this.mode = 'list';
      this.pendingPrompt = null;
      this.pendingVariables = [];
      const listMode = this.popover.querySelector('.prompt-popover-mode-list');
      const formMode = this.popover.querySelector('.prompt-popover-mode-variables');
      formMode.classList.add('hidden');
      listMode.classList.remove('hidden');
      this.positionPopover();
      const search = this.popover.querySelector('.prompt-popover-search');
      if (search) search.focus();
    }

    truncate(text, max = 120) {
      const collapsed = text.replace(/\s+/g, ' ').trim();
      return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
    }

    applyPrompt(prompt) {
      // Legacy entry point: keep working for any callers that hand the
      // picker a whole prompt object. Internal callers should prefer
      // applyPromptText so they can pass already-substituted text.
      this.applyPromptText(prompt.body);
    }

    applyPromptText(text) {
      const target = this.targetInput;
      if (!target) return;

      // Replace selection (if any) with the resolved text; otherwise
      // insert at the caret. Surrounding text is preserved on both sides.
      const existing = target.value || '';
      const start = target.selectionStart ?? existing.length;
      const end = target.selectionEnd ?? existing.length;
      const before = existing.slice(0, start);
      const after = existing.slice(end);
      const next = `${before}${text}${after}`;

      target.value = next;
      // Place cursor at the end of the inserted text.
      const caret = start + text.length;
      try { target.setSelectionRange(caret, caret); } catch {}
      target.focus();

      // Notify any listeners (auto-resize, send-btn enable, etc.).
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }

    destroy() {
      this.close();
      if (this.unsubscribe) this.unsubscribe();
    }
  }

  window.PromptPicker = PromptPicker;
})();
