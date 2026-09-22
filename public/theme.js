(() => {
  const storageKey = 'yerbas-explorer-layout-theme';
  const validThemes = new Set(['new', 'original']);
  const fallbackTheme = 'new';

  function storedTheme() {
    try {
      const value = localStorage.getItem(storageKey);
      return validThemes.has(value) ? value : fallbackTheme;
    } catch {
      return fallbackTheme;
    }
  }

  function updateControls(theme) {
    document.querySelectorAll('[data-layout-theme-option]').forEach((button) => {
      const active = button.dataset.layoutThemeOption === theme;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setTheme(nextTheme, options = {}) {
    const theme = validThemes.has(nextTheme) ? nextTheme : fallbackTheme;
    document.documentElement.dataset.layoutTheme = theme;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'original' ? '#303030' : '#030907');
    }

    if (options.persist !== false) {
      try {
        localStorage.setItem(storageKey, theme);
      } catch {
        // Browser storage can be disabled without breaking the theme toggle.
      }
    }

    updateControls(theme);

    if (options.emit !== false) {
      window.dispatchEvent(new CustomEvent('yerbas-layout-theme-change', {
        detail: { theme }
      }));
    }

    return theme;
  }

  const initialTheme = storedTheme();
  document.documentElement.dataset.layoutTheme = initialTheme;

  window.YerbasLayoutTheme = Object.freeze({
    get: () => document.documentElement.dataset.layoutTheme || fallbackTheme,
    set: (theme) => setTheme(theme)
  });

  function bindControls() {
    updateControls(document.documentElement.dataset.layoutTheme || fallbackTheme);
    document.querySelectorAll('[data-layout-theme-option]').forEach((button) => {
      button.addEventListener('click', () => {
        setTheme(button.dataset.layoutThemeOption);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindControls, { once: true });
  } else {
    bindControls();
  }
})();
