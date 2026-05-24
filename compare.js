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
  const view = new CompareView({ root, canPopout: false });
  await view.init();

  // Layout selector (only available in the full-tab popout).
  const layoutSelect = document.getElementById('layoutSelect');
  const applyLayout = (value) => {
    const panelList = root.querySelector('.compare-panel-list');
    if (!panelList) return;
    panelList.classList.remove('layout-stack', 'layout-grid-2', 'layout-grid-3');
    panelList.classList.add(`layout-${value}`);
  };
  applyLayout(layoutSelect.value);
  layoutSelect.addEventListener('change', () => applyLayout(layoutSelect.value));
})();
