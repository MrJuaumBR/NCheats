(function () {
  'use strict';

  const KEEP_VISIBLE_X = 120;
  const KEEP_VISIBLE_Y = 48;

  const BODY      = document.body;
  const SHOW_MENU = document.getElementById('showMenu');
  const LAYER     = document.getElementById('menu');
  const WINDOW_EL = document.getElementById('cheatWindow');
  const TITLEBAR  = document.getElementById('windowTitlebar');
  const MAX_BTN   = WINDOW_EL
    ? WINDOW_EL.querySelector('[data-window-action="maximize"]')
    : null;

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const isMobileViewport = () =>
    window.matchMedia('(max-width: 600px)').matches;

  const state = {
    open:       false,
    maximized:  false,
    minimized:  false,
    positioned: false,
    x: 0,
    y: 0,
    restore: null,
    drag: null
  };

  function setPosition(x, y) {
    if (!WINDOW_EL) return;

    const w = WINDOW_EL.offsetWidth;
    const h = WINDOW_EL.offsetHeight;

    const keepX = Math.min(KEEP_VISIBLE_X, w);
    const keepY = Math.min(KEEP_VISIBLE_Y, h);

    const minX = -(w - keepX);
    const maxX = window.innerWidth - keepX;
    const minY = 0;
    const maxY = window.innerHeight - keepY;

    state.x = clamp(x, minX, maxX);
    state.y = clamp(y, minY, maxY);

    WINDOW_EL.style.left = state.x + 'px';
    WINDOW_EL.style.top  = state.y + 'px';
    WINDOW_EL.classList.add('is-positioned');
    state.positioned = true;
  }

  function centerWindow() {
    if (!WINDOW_EL) return;

    const w = WINDOW_EL.offsetWidth;
    const h = WINDOW_EL.offsetHeight;

    if (isMobileViewport()) {
      const x = Math.round((window.innerWidth - w) / 2);
      setPosition(Math.max(8, x), 8);
      return;
    }

    setPosition(
      Math.round((window.innerWidth  - w) / 2),
      Math.round((window.innerHeight - h) / 2)
    );
  }

  function open() {
    if (!LAYER || !WINDOW_EL || state.open) return;

    state.open = true;
    state.minimized = false;

    LAYER.classList.add('is-open');
    LAYER.setAttribute('aria-hidden', 'false');
    WINDOW_EL.classList.remove('window--minimized');

    if (!state.positioned) centerWindow();
    else setPosition(state.x, state.y);

    if (SHOW_MENU) SHOW_MENU.setAttribute('aria-expanded', 'true');

    const activePanel = WINDOW_EL.querySelector('.win-panel.is-active');
    const searchInput =
      activePanel && activePanel.querySelector('input[type="search"]');

    if (searchInput && !isMobileViewport()) {
      searchInput.focus({ preventScroll: true });
    } else {
      WINDOW_EL.focus({ preventScroll: true });
    }
  }

  function close() {
    if (!LAYER || !WINDOW_EL || !state.open) return;

    state.open = false;
    state.minimized = false;
    state.drag = null;

    WINDOW_EL.classList.remove('window--minimized', 'is-dragging');
    if (TITLEBAR) TITLEBAR.classList.remove('is-dragging');
    BODY.classList.remove('is-window-dragging');

    LAYER.classList.remove('is-open');
    LAYER.setAttribute('aria-hidden', 'true');

    if (SHOW_MENU) {
      SHOW_MENU.setAttribute('aria-expanded', 'false');
      SHOW_MENU.focus({ preventScroll: true });
    }
  }

  function restoreFromMinimize() {
    if (!WINDOW_EL) return;
    state.minimized = false;
    WINDOW_EL.classList.remove('window--minimized');
    if (!state.maximized) setPosition(state.x, state.y);
    WINDOW_EL.focus({ preventScroll: true });
  }

  function toggle() {
    if (!state.open)     return open();
    if (state.minimized) return restoreFromMinimize();
    return close();
  }

  function minimize() {
    if (!WINDOW_EL || state.minimized) return;
    state.minimized = true;
    WINDOW_EL.classList.add('window--minimized');
    if (SHOW_MENU) SHOW_MENU.focus({ preventScroll: true });
  }

  function updateMaxButton() {
    if (!MAX_BTN) return;
    const label = state.maximized ? 'Restore' : 'Maximize';
    MAX_BTN.setAttribute('aria-label', label);
    MAX_BTN.title = label;
  }

  function toggleMaximize() {
    if (!WINDOW_EL) return;

    state.maximized = !state.maximized;

    if (state.maximized) {
      state.restore = { x: state.x, y: state.y };
      WINDOW_EL.classList.add('window--maximized');
    } else {
      WINDOW_EL.classList.remove('window--maximized');
      if (state.restore) setPosition(state.restore.x, state.restore.y);
      else setPosition(state.x, state.y);
    }

    updateMaxButton();
    WINDOW_EL.focus({ preventScroll: true });
  }

  function startDrag(event) {
    if (!WINDOW_EL || !TITLEBAR) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (state.maximized) return;
    if (event.target.closest('.window__btn')) return;

    const rect = WINDOW_EL.getBoundingClientRect();
    state.drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };

    TITLEBAR.classList.add('is-dragging');
    WINDOW_EL.classList.add('is-dragging');
    BODY.classList.add('is-window-dragging');

    try { TITLEBAR.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  }

  function onDragMove(event) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    setPosition(
      event.clientX - drag.offsetX,
      event.clientY - drag.offsetY
    );
  }

  function endDrag(event) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    state.drag = null;

    if (TITLEBAR) {
      TITLEBAR.classList.remove('is-dragging');
      try { TITLEBAR.releasePointerCapture(event.pointerId); } catch {}
    }
    if (WINDOW_EL) WINDOW_EL.classList.remove('is-dragging');
    BODY.classList.remove('is-window-dragging');
  }

  function init() {
    const missing = [];
    if (!LAYER)     missing.push('#menu');
    if (!WINDOW_EL) missing.push('#cheatWindow');
    if (!TITLEBAR)  missing.push('#windowTitlebar');

    if (missing.length) {
      console.error('WindowManager: missing markup →', missing.join(', '));
      return;
    }

    if (SHOW_MENU) {
      SHOW_MENU.addEventListener('click', toggle);
      SHOW_MENU.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    }

    document.querySelectorAll('[data-window-toggle]').forEach((el) => {
      if (el === SHOW_MENU) return;
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });

    TITLEBAR.addEventListener('pointerdown', startDrag);
    TITLEBAR.addEventListener('pointermove', onDragMove);
    TITLEBAR.addEventListener('pointerup', endDrag);
    TITLEBAR.addEventListener('pointercancel', endDrag);

    TITLEBAR.addEventListener('dblclick', (e) => {
      if (e.target.closest('.window__btn')) return;
      toggleMaximize();
    });

    WINDOW_EL.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-window-action]');
      if (!btn) return;
      switch (btn.dataset.windowAction) {
        case 'minimize': minimize();       break;
        case 'maximize': toggleMaximize(); break;
        case 'close':    close();          break;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!state.open || state.minimized) return;

      const active = document.activeElement;
      if (active && active.tagName === 'INPUT' && active.value) {
        active.value = '';
        active.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      close();
    });

    window.addEventListener('resize', () => {
      if (!state.open || state.maximized) return;
      setPosition(state.x, state.y);
    });

    LAYER.setAttribute('aria-hidden', 'true');
    if (SHOW_MENU) SHOW_MENU.setAttribute('aria-expanded', 'false');
    updateMaxButton();
  }

  window.WindowManager = {
    init,
    open,
    close,
    toggle,
    minimize,
    maximize: toggleMaximize,
    state
  };
})();