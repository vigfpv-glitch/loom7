(() => {
  const storageKey = 'loom7-theme';
  const root = document.documentElement;

  function applyTheme(theme, persist = false) {
    root.dataset.theme = theme;
    if (persist) {
      try {
        localStorage.setItem(storageKey, theme);
      } catch (error) {
        console.warn('Could not save the Loom7 appearance preference.', error);
      }
    }

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === 'dark' ? '#1b1e1b' : '#f8f6f1';

    const toggle = document.getElementById('themeModeToggle');
    if (toggle) {
      toggle.checked = theme === 'dark';
      toggle.setAttribute('aria-checked', String(toggle.checked));
    }

    document.dispatchEvent(new CustomEvent('loom7-theme-change', {detail: theme}));
  }

  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem(storageKey);
  } catch (error) {
    console.warn('Could not load the Loom7 appearance preference.', error);
  }
  applyTheme(savedTheme === 'dark' ? 'dark' : 'light');

  const toggleObserver = new MutationObserver(() => {
    const toggle = document.getElementById('themeModeToggle');
    if (!toggle) return;
    applyTheme(root.dataset.theme);
    toggleObserver.disconnect();
  });
  toggleObserver.observe(root, {childList: true, subtree: true});

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('themeModeToggle');
    if (!toggle) return;
    toggleObserver.disconnect();
    applyTheme(root.dataset.theme);
    toggle.addEventListener('change', () => applyTheme(toggle.checked ? 'dark' : 'light', true));
  });

  window.addEventListener('storage', event => {
    if (event.key === storageKey) applyTheme(event.newValue === 'dark' ? 'dark' : 'light');
  });
})();
