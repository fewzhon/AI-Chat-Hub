// prompt-library.js
//
// Data layer for the user's saved prompt library. Reusable in both the
// side panel and the full-tab Compare popout.
//
// Storage: chrome.storage.local under the key 'promptLibrary'. We store
// the whole list as a single item to keep CRUD straightforward; the
// local-area quota (~10 MB by default) is plenty for thousands of
// prompts of normal length.
//
// API:
//   const lib = new PromptLibrary();
//   await lib.load();
//   lib.getAll();           -> array of {id, title, body, createdAt, updatedAt}
//   lib.get(id);            -> single prompt or null
//   lib.add(title, body);   -> returns the new prompt
//   lib.update(id, fields); -> returns the updated prompt or null
//   lib.remove(id);         -> returns boolean (true if removed)
//   lib.subscribe(fn);      -> returns unsubscribe() function
//
// The library auto-saves after every mutation and notifies subscribers
// so picker popovers + the manage view stay in sync.

(function () {
  const STORAGE_KEY = 'promptLibrary';

  // Shipped on first install. Users can delete or edit them freely.
  const DEFAULT_PROMPTS = [
    {
      title: 'Summarize',
      body: 'Summarize the following text in 3-5 concise bullet points, focused on the key takeaways:\n\n',
    },
    {
      title: 'Explain like I\'m 5',
      body: 'Explain the following concept in simple, plain language a 10-year-old could understand. Use analogies where helpful:\n\n',
    },
    {
      title: 'Code review',
      body: 'Review the following code for correctness, readability, and potential bugs. List your findings as numbered items with concrete suggestions:\n\n```\n\n```',
    },
    {
      title: 'Translate to plain English',
      body: 'Rewrite the following text in clear, plain English. Keep the meaning intact but remove jargon and unnecessary complexity:\n\n',
    },
  ];

  function generateId() {
    // Stable, sortable, collision-resistant enough for a personal library.
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  class PromptLibrary {
    constructor() {
      this.prompts = [];
      this.loaded = false;
      this.subscribers = new Set();

      // Live-reload when storage changes (e.g. the popout adds a prompt
      // while the side panel is also open).
      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local' || !changes[STORAGE_KEY]) return;
          const next = changes[STORAGE_KEY].newValue;
          if (Array.isArray(next)) {
            this.prompts = next;
            this.notify();
          }
        });
      }
    }

    async load() {
      try {
        const stored = await chrome.storage.local.get({ [STORAGE_KEY]: null });
        if (Array.isArray(stored[STORAGE_KEY])) {
          this.prompts = stored[STORAGE_KEY];
        } else {
          this.prompts = DEFAULT_PROMPTS.map((p) => this.hydrate(p));
          await this.persist();
        }
      } catch (err) {
        console.error('PromptLibrary.load failed:', err);
        this.prompts = [];
      }
      this.loaded = true;
      this.notify();
    }

    hydrate(partial) {
      const now = Date.now();
      return {
        id: partial.id || generateId(),
        title: partial.title || 'Untitled',
        body: partial.body || '',
        createdAt: partial.createdAt || now,
        updatedAt: partial.updatedAt || now,
      };
    }

    getAll() {
      return this.prompts.slice();
    }

    get(id) {
      return this.prompts.find((p) => p.id === id) || null;
    }

    async add(title, body) {
      const next = this.hydrate({ title, body });
      this.prompts.push(next);
      await this.persist();
      this.notify();
      return next;
    }

    async update(id, fields) {
      const idx = this.prompts.findIndex((p) => p.id === id);
      if (idx < 0) return null;
      const updated = { ...this.prompts[idx] };
      if (typeof fields.title === 'string') updated.title = fields.title;
      if (typeof fields.body === 'string') updated.body = fields.body;
      updated.updatedAt = Date.now();
      this.prompts[idx] = updated;
      await this.persist();
      this.notify();
      return updated;
    }

    async remove(id) {
      const before = this.prompts.length;
      this.prompts = this.prompts.filter((p) => p.id !== id);
      if (this.prompts.length === before) return false;
      await this.persist();
      this.notify();
      return true;
    }

    async persist() {
      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: this.prompts });
      } catch (err) {
        console.error('PromptLibrary.persist failed:', err);
      }
    }

    subscribe(callback) {
      this.subscribers.add(callback);
      // Immediately fire with current state so the subscriber renders.
      try { callback(this.getAll()); } catch {}
      return () => this.subscribers.delete(callback);
    }

    notify() {
      const snapshot = this.getAll();
      for (const fn of this.subscribers) {
        try { fn(snapshot); } catch (err) { console.error('PromptLibrary subscriber error:', err); }
      }
    }
  }

  window.PromptLibrary = PromptLibrary;
})();
