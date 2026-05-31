// compare.js - bootstraps the full-tab Compare popout window.

(async function () {
  // Apply theme preference (mirrors the side panel's behavior so the
  // popout and side panel feel like one app).
  try {
    const { themePreference } = await chrome.storage.sync.get({ themePreference: 'system' });
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const effective =
      themePreference === 'dark'  ? 'dark'  :
      themePreference === 'light' ? 'light' :
      mql.matches                 ? 'dark'  : 'light';
    document.documentElement.setAttribute('data-theme', effective);
    mql.addEventListener('change', () => {
      if (themePreference === 'system') {
        document.documentElement.setAttribute('data-theme', mql.matches ? 'dark' : 'light');
      }
    });
  } catch {}

  const root = document.getElementById('compareRoot');

  // The popout shares the prompt library, but doesn't expose the manage
  // view (that lives in the side panel). Clicking "Manage prompts..."
  // from the picker is a no-op here apart from closing the popover;
  // users can open the side panel to manage their library.
  const library = new PromptLibrary();
  await library.load();

  const view = new CompareView({
    root,
    canPopout: false,
    promptLibrary: library,
  });
  await view.init();

  // ------------------------------------------------------------------
  // Layout selector (only available in the full-tab popout). The user's
  // choice is persisted to chrome.storage.local under COMPARE_LAYOUT_KEY
  // and restored on the next popout, so it sticks across sessions.
  // ------------------------------------------------------------------
  const COMPARE_LAYOUT_KEY = 'compareLayoutV1';
  // Default to "auto" in the popout - a wide desktop monitor should
  // never open into a single-column stack just because that's what
  // the side panel uses. The user can still pick "stack" explicitly
  // and we'll remember it.
  const DEFAULT_LAYOUT = 'auto';
  // Whitelist guards against stale or hand-edited storage values
  // breaking the popover. Anything not in here falls back to default.
  const KNOWN_LAYOUTS = [
    'auto',
    'side-by-side',
    'stack',
    'grid-2',
    'grid-3',
    'grid-4',
    'grid-5',
  ];

  const layoutSelect = document.getElementById('layoutSelect');

  const applyLayout = (value) => {
    const panelList = root.querySelector('.compare-panel-list');
    if (!panelList) return;
    // Strip every layout class before applying the new one so we never
    // end up with two layouts active at once after a switch.
    for (const v of KNOWN_LAYOUTS) panelList.classList.remove(`layout-${v}`);
    panelList.classList.add(`layout-${value}`);
  };

  // 1. Load persisted choice (or fall back to default).
  let stored = DEFAULT_LAYOUT;
  try {
    const result = await chrome.storage.local.get({ [COMPARE_LAYOUT_KEY]: DEFAULT_LAYOUT });
    if (KNOWN_LAYOUTS.includes(result[COMPARE_LAYOUT_KEY])) {
      stored = result[COMPARE_LAYOUT_KEY];
    }
  } catch (err) {
    console.warn('compare: could not read stored layout, using default', err);
  }
  layoutSelect.value = stored;
  applyLayout(stored);

  // 2. Persist on every change so the choice survives popout reloads.
  layoutSelect.addEventListener('change', async () => {
    const value = layoutSelect.value;
    applyLayout(value);
    try {
      await chrome.storage.local.set({ [COMPARE_LAYOUT_KEY]: value });
    } catch (err) {
      // Non-fatal - the current session still works, the next one just
      // won't remember. Log for visibility.
      console.warn('compare: could not persist layout choice', err);
    }
  });
})();
