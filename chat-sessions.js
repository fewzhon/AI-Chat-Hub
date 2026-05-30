// =====================================================================
// chat-sessions.js
// ---------------------------------------------------------------------
// Data layer for Quick Chat conversation sessions. Each session has a
// unique id, a user-editable title, and an isolated message history.
// One session is "active" at any time - sendMessage / appendChatTurn /
// clearChat in sidepanel.js all operate against the active session.
//
// Persistence (chrome.storage.local):
//   chatSessionsV1      -> { sessions: SessionRecord[], activeId: string|null }
//   chatHistory         -> legacy single-history key. Migrated into a
//                          "Chat 1" session on first load, then preserved
//                          read-only in case the user downgrades.
//
// The module is intentionally framework-free and side-effect free at
// import time; it exposes a single ChatSessions class on window so the
// existing classic <script> include pattern in sidepanel.html keeps
// working without bundling.
// =====================================================================

(function () {
  'use strict';

  const STORAGE_KEY = 'chatSessionsV1';
  const LEGACY_HISTORY_KEY = 'chatHistory';
  const MAX_TITLE_LEN = 80;
  // Cap each session at the same MAX as the old single-history. We
  // truncate from the OLDER end on overflow so the most recent context
  // is always preserved for the next API call.
  const DEFAULT_MAX_TURNS = 200;

  const isValidTurn = (turn) =>
    turn &&
    typeof turn.text === 'string' &&
    (turn.role === 'user' || turn.role === 'model');

  const sanitiseTitle = (raw) => {
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    return trimmed.slice(0, MAX_TITLE_LEN);
  };

  const generateId = () =>
    `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  /**
   * Manages an ordered list of chat sessions plus a pointer to the
   * currently active one. All mutations call save() and notify
   * subscribers so the UI can re-render reactively.
   */
  class ChatSessions {
    constructor({ maxTurns = DEFAULT_MAX_TURNS } = {}) {
      this.maxTurns = maxTurns;
      this.sessions = [];
      this.activeId = null;
      this.listeners = new Set();
      this.loaded = false;
    }

    // -------------------- lifecycle --------------------

    /**
     * Loads sessions from storage. On first run, migrates the legacy
     * `chatHistory` key into a single "Chat 1" session so existing
     * users don't lose their conversation. Idempotent across calls.
     */
    async load() {
      if (this.loaded) return;

      const stored = await chrome.storage.local.get({
        [STORAGE_KEY]: null,
        [LEGACY_HISTORY_KEY]: null,
      });

      const record = stored[STORAGE_KEY];
      if (record && Array.isArray(record.sessions) && record.sessions.length > 0) {
        this.sessions = record.sessions
          .map((s) => this._normalise(s))
          .filter(Boolean);
        const requested = record.activeId;
        this.activeId =
          requested && this.sessions.find((s) => s.id === requested)
            ? requested
            : this.sessions[0].id;
        this.loaded = true;
        return;
      }

      // Migration path: surface the legacy single history as session #1.
      const legacy = stored[LEGACY_HISTORY_KEY];
      if (Array.isArray(legacy) && legacy.length > 0) {
        const history = legacy.filter(isValidTurn);
        if (history.length > 0) {
          const migrated = this._build('Chat 1', history);
          this.sessions = [migrated];
          this.activeId = migrated.id;
          await this.save();
          this.loaded = true;
          return;
        }
      }

      // Brand new user: start with one empty session so the UI always
      // has something to attach to. Cheaper than handling null active.
      const fresh = this._build('New chat', []);
      this.sessions = [fresh];
      this.activeId = fresh.id;
      await this.save();
      this.loaded = true;
    }

    async save() {
      const payload = {
        sessions: this.sessions,
        activeId: this.activeId,
      };
      await chrome.storage.local.set({ [STORAGE_KEY]: payload });
    }

    // -------------------- subscriptions --------------------

    /**
     * Subscribes to any state change. Listener receives the entire
     * ChatSessions instance for ergonomic access in render code.
     * Returns an unsubscribe fn.
     */
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    _notify() {
      for (const fn of this.listeners) {
        try {
          fn(this);
        } catch (err) {
          console.error('ChatSessions listener threw:', err);
        }
      }
    }

    // -------------------- reads --------------------

    list() {
      return this.sessions.slice();
    }

    get(id) {
      return this.sessions.find((s) => s.id === id) || null;
    }

    getActive() {
      return this.get(this.activeId);
    }

    /**
     * Returns the history of the active session. Always an array,
     * never null. Callers can mutate the returned value only via
     * appendTurn / clearActive - direct mutation is not supported.
     */
    getActiveHistory() {
      const active = this.getActive();
      return active ? active.history.slice() : [];
    }

    // -------------------- writes --------------------

    /**
     * Creates a new session, makes it active, and returns its record.
     * Title is sanitised; an empty title falls back to "Chat N" using
     * the next sequential index across the visible list.
     */
    async create(rawTitle = '') {
      const title = sanitiseTitle(rawTitle) || this._nextDefaultTitle();
      const session = this._build(title, []);
      this.sessions.push(session);
      this.activeId = session.id;
      await this.save();
      this._notify();
      return session;
    }

    async setActive(id) {
      if (!id || id === this.activeId) return;
      if (!this.sessions.find((s) => s.id === id)) return;
      this.activeId = id;
      await this.save();
      this._notify();
    }

    async rename(id, rawTitle) {
      const session = this.get(id);
      if (!session) return false;
      const title = sanitiseTitle(rawTitle);
      if (!title) return false;
      session.title = title;
      session.updatedAt = Date.now();
      await this.save();
      this._notify();
      return true;
    }

    /**
     * Deletes a session. If the active session is removed, the
     * adjacent (or first remaining) session becomes active. If the
     * list ends up empty, a fresh "New chat" is created so the rest
     * of the app can rely on an always-present active session.
     */
    async delete(id) {
      const idx = this.sessions.findIndex((s) => s.id === id);
      if (idx === -1) return false;

      const wasActive = this.activeId === id;
      this.sessions.splice(idx, 1);

      if (this.sessions.length === 0) {
        const fresh = this._build('New chat', []);
        this.sessions.push(fresh);
        this.activeId = fresh.id;
      } else if (wasActive) {
        const fallback = this.sessions[Math.min(idx, this.sessions.length - 1)];
        this.activeId = fallback.id;
      }

      await this.save();
      this._notify();
      return true;
    }

    /**
     * Appends one turn to the active session, enforces the turn cap,
     * and persists. Returns the updated history (a copy).
     */
    async appendTurn(turn) {
      if (!isValidTurn(turn)) return this.getActiveHistory();
      const active = this.getActive();
      if (!active) return [];

      active.history.push({ role: turn.role, text: turn.text });
      if (active.history.length > this.maxTurns) {
        // Trim from the FRONT - preserve recent context, drop oldest.
        active.history.splice(0, active.history.length - this.maxTurns);
      }
      active.updatedAt = Date.now();
      await this.save();
      this._notify();
      return active.history.slice();
    }

    async clearActive() {
      const active = this.getActive();
      if (!active) return;
      active.history = [];
      active.updatedAt = Date.now();
      await this.save();
      this._notify();
    }

    // -------------------- internals --------------------

    _build(title, history) {
      const now = Date.now();
      return {
        id: generateId(),
        title: sanitiseTitle(title) || 'New chat',
        history: Array.isArray(history) ? history.filter(isValidTurn) : [],
        createdAt: now,
        updatedAt: now,
      };
    }

    /**
     * Validates / coerces a session record loaded from storage.
     * Returns null for unsalvageable entries so they get filtered.
     */
    _normalise(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const id = typeof raw.id === 'string' && raw.id ? raw.id : generateId();
      const title = sanitiseTitle(raw.title) || 'Untitled';
      const history = Array.isArray(raw.history)
        ? raw.history.filter(isValidTurn)
        : [];
      const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
      const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt;
      return { id, title, history, createdAt, updatedAt };
    }

    _nextDefaultTitle() {
      // Counts only the default "Chat N" pattern - user-renamed
      // sessions are not considered when picking the next number.
      const re = /^Chat (\d+)$/;
      let max = 0;
      for (const s of this.sessions) {
        const m = re.exec(s.title);
        if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
      }
      return `Chat ${max + 1}`;
    }
  }

  window.ChatSessions = ChatSessions;
})();
