(function () {
  'use strict';

  const KEEP_VISIBLE_X = 120;
  const KEEP_VISIBLE_Y = 48;

  const BODY      = document.body;
  const SHOW_MENU = document.getElementById('showMenu');
  const LAYER     = document.getElementById('menu');
  const WINDOW_EL = document.getElementById('cheatWindow');
  const TITLEBAR  = document.getElementById('windowTitlebar');
  const RESIZE_HANDLE = document.querySelector('.window__resize');
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
    drag: null,
    resize: null
  };
  let lastTrigger = document.querySelector('#main-content [data-window-toggle]') || SHOW_MENU;

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

  function setSize(width, height) {
    if (!WINDOW_EL || state.maximized || isMobileViewport()) return;
    const maxWidth = Math.max(200, window.innerWidth - 24);
    const maxHeight = Math.max(180, window.innerHeight - 24);
    const minWidth = Math.min(320, maxWidth);
    const minHeight = Math.min(280, maxHeight);
    WINDOW_EL.style.width = `${clamp(width, minWidth, maxWidth)}px`;
    WINDOW_EL.style.height = `${clamp(height, minHeight, maxHeight)}px`;
    setPosition(state.x, state.y);
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

  function open(trigger) {
    if (!LAYER || !WINDOW_EL || state.open) return;
    if (trigger && trigger.isConnected) {
      const collapsedNav = trigger.closest('.collapse');
      const navWillCollapse = window.innerWidth < 992 && collapsedNav;
      lastTrigger = navWillCollapse
        ? (document.querySelector('#main-content [data-window-toggle]') || trigger)
        : trigger;
    }

    state.open = true;
    state.minimized = false;

    LAYER.classList.add('is-open');
    LAYER.setAttribute('aria-hidden', 'false');
    WINDOW_EL.classList.remove('window--minimized');

    if (isMobileViewport()) {
      WINDOW_EL.style.removeProperty('width');
      WINDOW_EL.style.removeProperty('height');
      centerWindow();
    } else if (!state.positioned) {
      centerWindow();
    } else {
      setPosition(state.x, state.y);
    }

    document.querySelectorAll('[data-window-toggle], #showMenu')
      .forEach((triggerEl) => triggerEl.setAttribute('aria-expanded', 'true'));

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

    document.querySelectorAll('[data-window-toggle], #showMenu')
      .forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    const triggerIsInCollapsedNav = window.innerWidth < 992 && lastTrigger && lastTrigger.closest('.collapse');
    const visibleTrigger = document.querySelector('#main-content [data-window-toggle]');
    const focusTarget = triggerIsInCollapsedNav && visibleTrigger && visibleTrigger.isConnected
      ? visibleTrigger
      : (lastTrigger && lastTrigger.isConnected ? lastTrigger : SHOW_MENU);
    if (focusTarget && focusTarget.isConnected) focusTarget.focus({ preventScroll: true });
  }

  function restoreFromMinimize() {
    if (!WINDOW_EL) return;
    state.minimized = false;
    WINDOW_EL.classList.remove('window--minimized');
    if (!state.maximized) setPosition(state.x, state.y);
    document.querySelectorAll('[data-window-toggle], #showMenu')
      .forEach((trigger) => trigger.setAttribute('aria-expanded', 'true'));
    WINDOW_EL.focus({ preventScroll: true });
  }

  function toggle(trigger) {
    if (!state.open)     return open(trigger);
    if (state.minimized) return restoreFromMinimize();
    return close();
  }

  function minimize() {
    if (!WINDOW_EL || state.minimized) return;
    state.minimized = true;
    WINDOW_EL.classList.add('window--minimized');
    document.querySelectorAll('[data-window-toggle], #showMenu')
      .forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus({ preventScroll: true });
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

  function startResize(event) {
    if (!WINDOW_EL || state.maximized || isMobileViewport()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    state.resize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: WINDOW_EL.offsetWidth,
      startHeight: WINDOW_EL.offsetHeight
    };
    WINDOW_EL.classList.add('is-resizing');
    try { RESIZE_HANDLE.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
    event.stopPropagation();
  }

  function onResizeMove(event) {
    const resize = state.resize;
    if (!resize || event.pointerId !== resize.pointerId) return;
    setSize(resize.startWidth + event.clientX - resize.startX,
            resize.startHeight + event.clientY - resize.startY);
    event.preventDefault();
  }

  function endResize(event) {
    const resize = state.resize;
    if (!resize || event.pointerId !== resize.pointerId) return;
    state.resize = null;
    WINDOW_EL.classList.remove('is-resizing');
    try { RESIZE_HANDLE.releasePointerCapture(event.pointerId); } catch {}
  }

  function resizeByKeyboard(event) {
    const step = event.shiftKey ? 64 : 32;
    const width = WINDOW_EL.offsetWidth;
    const height = WINDOW_EL.offsetHeight;
    const deltas = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      ArrowUp: [0, -step], ArrowDown: [0, step]
    };
    const delta = deltas[event.key];
    if (!delta || state.maximized || isMobileViewport()) return;
    event.preventDefault();
    setSize(width + delta[0], height + delta[1]);
  }

  function onViewportResize() {
    if (!state.open || state.maximized) return;
    if (isMobileViewport()) {
      WINDOW_EL.style.removeProperty('width');
      WINDOW_EL.style.removeProperty('height');
    } else {
      const width = WINDOW_EL.offsetWidth;
      const height = WINDOW_EL.offsetHeight;
      const maxWidth = Math.max(200, window.innerWidth - 24);
      const maxHeight = Math.max(180, window.innerHeight - 24);
      if (width > maxWidth || height > maxHeight) {
        setSize(Math.min(width, maxWidth), Math.min(height, maxHeight));
      }
    }
    setPosition(state.x, state.y);
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
      SHOW_MENU.addEventListener('click', () => toggle(SHOW_MENU));
    }

    document.querySelectorAll('[data-window-toggle]').forEach((el) => {
      if (el === SHOW_MENU) return;
      el.addEventListener('click', () => toggle(el));
    });

    TITLEBAR.addEventListener('pointerdown', startDrag);
    TITLEBAR.addEventListener('pointermove', onDragMove);
    TITLEBAR.addEventListener('pointerup', endDrag);
    TITLEBAR.addEventListener('pointercancel', endDrag);

    if (RESIZE_HANDLE) {
      RESIZE_HANDLE.addEventListener('pointerdown', startResize);
      RESIZE_HANDLE.addEventListener('pointermove', onResizeMove);
      RESIZE_HANDLE.addEventListener('pointerup', endResize);
      RESIZE_HANDLE.addEventListener('pointercancel', endResize);
      RESIZE_HANDLE.addEventListener('keydown', resizeByKeyboard);
    }

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
      if (!state.open) return;
      close();
    });

    window.addEventListener('resize', onViewportResize);

    LAYER.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('[data-window-toggle], #showMenu')
      .forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
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
