(function () {
  'use strict';

  const STORAGE_KEY = 'ncheats:appearance';
  const SKINS = ['default', 'cyberpunk', 'discord', 'solo-leveling', 'xbox-360', 'windows-xp'];
  const MODES = ['dark', 'light'];
  const PALETTES = ['a', 'b', 'c', 'd'];
  const DEFAULTS = { skin: 'default', mode: 'dark', palette: 'a' };
  const PALETTE_NAMES = {
    default: { a: ['Amethyst', '#8b5cf6'], b: ['Rose', '#ec4899'], c: ['Graphite', '#64748b'], d: ['Lagoon', '#14b8a6'] },
    cyberpunk: { a: ['Neon Cyan', '#00d9f5'], b: ['Voltage Magenta', '#ff3cac'], c: ['Carbon Silver', '#aab7c4'], d: ['Toxic Lime', '#b7f34a'] },
    discord: { a: ['Blurple', '#5865f2'], b: ['Community Rose', '#e879a9'], c: ['Slate', '#77839a'], d: ['Mint', '#36c9a2'] },
    'solo-leveling': { a: ['Monarch Blue', '#4e8cff'], b: ['Violet Flame', '#a78bfa'], c: ['Steel', '#8b9bb7'], d: ['Royal Cyan', '#31d7ea'] },
    'xbox-360': { a: ['Royale Blue', '#3478db'], b: ['Blades Green', '#107c10'], c: ['Warm Gold', '#d6a63c'], d: ['Ember', '#d85442'] },
    'windows-xp': { a: ['Luna Blue', '#2675d8'], b: ['Rosewood', '#b34062'], c: ['Silver', '#778398'], d: ['Olive Green', '#64852f'] }
  };

  function valid(value, choices, fallback) {
    return choices.includes(value) ? value : fallback;
  }

  function readSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
      return saved;
    } catch {
      return {};
    }
  }

  function normalizeSaved(saved) {
    const skin = valid(saved.skin, SKINS, DEFAULTS.skin);
    let legacyMode = '';
    try { legacyMode = localStorage.getItem('theme') || ''; } catch {}
    const state = {
      skin,
      mode: valid(saved.mode, MODES, valid(legacyMode, MODES, DEFAULTS.mode)),
      palette: valid(saved.palette, PALETTES, DEFAULTS.palette),
      perSkin: {}
    };
    if (saved.perSkin && typeof saved.perSkin === 'object' && !Array.isArray(saved.perSkin)) {
      for (const key of SKINS) {
        const entry = saved.perSkin[key];
        if (!entry || typeof entry !== 'object') continue;
        state.perSkin[key] = {
          mode: valid(entry.mode, MODES, DEFAULTS.mode),
          palette: valid(entry.palette, PALETTES, DEFAULTS.palette)
        };
      }
    }
    state.perSkin[skin] = { mode: state.mode, palette: state.palette };
    return state;
  }

  let state = normalizeSaved(readSaved());
  let initialized = false;

  function persist() {
    state.perSkin[state.skin] = { mode: state.mode, palette: state.palette };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function apply({ save = true } = {}) {
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) return;

    state.skin = valid(state.skin, SKINS, DEFAULTS.skin);
    state.mode = valid(state.mode, MODES, DEFAULTS.mode);
    state.palette = valid(state.palette, PALETTES, DEFAULTS.palette);

    root.dataset.skin = state.skin;
    root.dataset.mode = state.mode;
    root.dataset.palette = state.palette;
    for (const value of SKINS) body.classList.remove(`skin-${value}`);
    for (const value of MODES) body.classList.remove(`theme-${value}`);
    for (const value of PALETTES) body.classList.remove(`palette-${value}`);
    body.classList.add(`skin-${state.skin}`, `theme-${state.mode}`, `palette-${state.palette}`);
    body.dataset.theme = state.mode;

    if (save) persist();
    updateControls();
    document.dispatchEvent(new CustomEvent('themechange', { detail: {
      skin: state.skin, mode: state.mode, palette: state.palette
    } }));
  }

  function updateControls() {
    const skinSelect = document.getElementById('skinSelect');
    if (skinSelect) skinSelect.value = state.skin;
    document.querySelectorAll('input[name="themeMode"]').forEach((input) => {
      input.checked = input.value === state.mode;
    });
    document.querySelectorAll('input[name="themePalette"]').forEach((input) => {
      const option = PALETTE_NAMES[state.skin][input.value];
      input.checked = input.value === state.palette;
      const label = input.closest('[data-palette-option]');
      if (!label || !option) return;
      label.querySelector('[data-palette-label]').textContent = option[0];
      label.querySelector('[data-palette-swatch]').style.setProperty('--swatch-color', option[1]);
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    const skinSelect = document.getElementById('skinSelect');
    if (skinSelect) {
      skinSelect.addEventListener('change', () => {
        const nextSkin = valid(skinSelect.value, SKINS, DEFAULTS.skin);
        state.perSkin[state.skin] = { mode: state.mode, palette: state.palette };
        const remembered = state.perSkin[nextSkin] || DEFAULTS;
        state.skin = nextSkin;
        state.mode = valid(remembered.mode, MODES, DEFAULTS.mode);
        state.palette = valid(remembered.palette, PALETTES, DEFAULTS.palette);
        apply();
      });
    }

    document.querySelectorAll('input[name="themeMode"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          state.mode = valid(input.value, MODES, DEFAULTS.mode);
          apply();
        }
      });
    });
    document.querySelectorAll('input[name="themePalette"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          state.palette = valid(input.value, PALETTES, DEFAULTS.palette);
          apply();
        }
      });
    });

    const panel = document.getElementById('appearanceMenu');
    if (panel) {
      document.addEventListener('pointerdown', (event) => {
        if (!panel.contains(event.target)) panel.open = false;
      });
      panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel.open) {
          event.stopPropagation();
          panel.open = false;
          panel.querySelector('summary').focus();
        }
      });
    }

    const nav = document.getElementById('navbarNav');
    const toggler = document.querySelector('[data-bs-target="#navbarNav"]');
    if (nav && window.bootstrap && window.bootstrap.Collapse) {
      const collapse = window.bootstrap.Collapse.getOrCreateInstance(nav, { toggle: false });
      nav.querySelectorAll('a, button').forEach((control) => {
        control.addEventListener('click', () => collapse.hide());
      });
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !nav.classList.contains('show')) return;
        collapse.hide();
        if (toggler) toggler.focus();
      });
    }
    apply({ save: false });
  }

  window.NCheatsTheme = { init, apply, getState: () => ({
    skin: state.skin, mode: state.mode, palette: state.palette
  }) };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
