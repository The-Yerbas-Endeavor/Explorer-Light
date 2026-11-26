(() => {
  const storageKey = 'yerbas-explorer-layout-theme';
  const validThemes = new Set(['new', 'original']);
  const fallbackTheme = 'new';
  const colorStorageKey = 'yerbas-explorer-color-theme';
  let colorTheme = 'light';
  try {
    if (localStorage.getItem(colorStorageKey) === 'dark') colorTheme = 'dark';
  } catch { /* Color preferences work without storage. */ }

  function updateColorTheme() {
    document.documentElement.dataset.colorTheme = colorTheme;
    document.querySelectorAll('[data-color-theme-toggle]').forEach(button => {
      const next = colorTheme === 'light' ? 'dark' : 'light';
      button.textContent = next === 'dark' ? 'Dark' : 'Light';
      button.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = document.documentElement.dataset.layoutTheme === 'original'
      ? '#303030' : colorTheme === 'dark' ? '#14211b' : '#f5f8f3';
  }

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

    updateColorTheme();

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
  updateColorTheme();

  window.YerbasLayoutTheme = Object.freeze({
    get: () => document.documentElement.dataset.layoutTheme || fallbackTheme,
    set: (theme) => setTheme(theme)
  });

  function bindControls() {
    const menuButton = document.querySelector('.navigation-toggle');
    const navigation = document.querySelector('#primary-navigation');
    const closeNavigation = () => {
      menuButton?.setAttribute('aria-expanded', 'false');
      navigation?.classList.remove('is-open');
    };
    menuButton?.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(open));
      navigation?.classList.toggle('is-open', open);
    });
    navigation?.addEventListener('click', event => {
      if (event.target.closest('a')) closeNavigation();
    });
    document.addEventListener('click', event => {
      document.querySelectorAll('.appearance-menu[open]').forEach(menu => {
        if (!menu.contains(event.target)) menu.open = false;
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeNavigation();
        document.querySelectorAll('.appearance-menu[open]').forEach(menu => {
          menu.open = false;
          menu.querySelector('summary')?.focus();
        });
      }
    });

    updateColorTheme();
    document.querySelectorAll('[data-color-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        colorTheme = colorTheme === 'light' ? 'dark' : 'light';
        try { localStorage.setItem(colorStorageKey, colorTheme); } catch { /* Optional preference. */ }
        updateColorTheme();
      });
    });
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
