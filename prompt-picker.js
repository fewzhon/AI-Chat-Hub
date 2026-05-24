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
      if (event.key === 'Escape') {
        this.close();
        this.anchorBtn.focus();
      }
    }

    buildPopover() {
      const popover = document.createElement('div');
      popover.className = 'prompt-popover';

      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'prompt-popover-search';
      search.placeholder = 'Search prompts...';
      search.value = this.searchTerm;
      search.addEventListener('input', () => {
        this.searchTerm = search.value;
        this.renderList();
      });

      const list = document.createElement('div');
      list.className = 'prompt-popover-list';

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

      popover.appendChild(search);
      popover.appendChild(list);
      popover.appendChild(footer);
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
        item.innerHTML = `
          <div class="prompt-popover-item-title"></div>
          <div class="prompt-popover-item-body"></div>
        `;
        item.querySelector('.prompt-popover-item-title').textContent = prompt.title;
        item.querySelector('.prompt-popover-item-body').textContent = this.truncate(prompt.body);

        item.addEventListener('click', () => {
          this.applyPrompt(prompt);
          this.close();
        });
        list.appendChild(item);
      }
    }

    truncate(text, max = 120) {
      const collapsed = text.replace(/\s+/g, ' ').trim();
      return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
    }

    applyPrompt(prompt) {
      const target = this.targetInput;
      if (!target) return;

      // Replace selection (if any) with the prompt body; otherwise prepend
      // the prompt to whatever is already there.
      const existing = target.value || '';
      const start = target.selectionStart ?? existing.length;
      const end = target.selectionEnd ?? existing.length;
      const before = existing.slice(0, start);
      const after = existing.slice(end);
      const next = `${before}${prompt.body}${after}`;

      target.value = next;
      // Place cursor at the end of the inserted text.
      const caret = start + prompt.body.length;
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
