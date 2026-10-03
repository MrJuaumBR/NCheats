/* ============================================================
   Nintendo Cheats — 3DS, Switch & GBA
   script.js
   ============================================================
   TABLE OF CONTENTS
   01. Config
   02. Utilities
   03. Theme manager
   04. Library (cheats + titles union, multi-source)
   05. NLib (Switch metadata enrichment)
   06. Tabs & search UI
   07. Boot
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     01. CONFIG
     ========================================================== */

  const LIBRARIES = {
    'switch': {
      label: 'Switch',
      platform: 'nx',
      cheatsUrls: [
        'static/data/switch.json',
        'https://raw.githubusercontent.com/blawar/titledb/refs/heads/master/cheats.json'
      ],
      titleSources: [
        'static/data/switch-titles.json'
      ],
      normalize: normalizeSwitch,
      searchId:  'switchSearch',
      resultsId: 'switchResults'
    },
    '3ds': {
      label: '3DS',
      platform: 'ctr',
      cheatsUrls: [
        'static/data/3ds.json'
      ],
      titleSources: [
        'static/data/3ds-titles.json'
      ],
      normalize: normalize3DS,
      searchId:  'search3ds',
      resultsId: 'results3ds'
    },
    'gba': {
      label: 'GBA',
      platform: 'gba',
      /* GBA FIX: point at the local file first. */
      cheatsUrls: [
        'static/data/gba.json'
      ],
      /* GBA has no external title metadata — names come from the cheat file. */
      titleSources: [],
      normalize: normalizeGBA,
      searchId:  'searchGba',
      resultsId: 'resultsGba'
    }
  };

  const SEARCH_LIMIT    = 100;
  const SEARCH_DEBOUNCE = 140;

  const BODY         = document.body;
  const THEME_SWITCH = document.getElementById('themeSwitch');


  /* ==========================================================
     02. UTILITIES
     ========================================================== */

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  const debounce = (fn, wait) => {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };

  const cleanTid = (tid) =>
    String(tid || '').trim().replace(/\s+/g, '').toUpperCase();

  function nintendoUrl(platform, tid, name) {
    const cleanId = cleanTid(tid);
    if (!cleanId) return '';

    if (platform === 'nx') {
      return `https://ec.nintendo.com/apps/${encodeURIComponent(cleanId)}/US`;
    }

    if (platform === 'ctr') {
      const q = encodeURIComponent(name || cleanId);
      return `https://www.nintendo.com/search/?q=${q}`;
    }

    // GBA — no Nintendo link at all.
    return '';
  }


  /* ==========================================================
     03. THEME MANAGER
     ========================================================== */

  function themeApply(theme, persist = true) {
    if (!theme) return;
    BODY.setAttribute('data-theme', theme);
    if (persist) {
      try { localStorage.setItem('theme', theme); } catch { /* noop */ }
    }
  }

  function themeInit() {
    let stored = null;
    try { stored = localStorage.getItem('theme'); } catch { /* noop */ }

    if (stored === 'light' || stored === 'dark') {
      themeApply(stored, false);
    } else {
      const prefersDark =
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      themeApply(prefersDark ? 'dark' : 'light', false);
    }

    if (!THEME_SWITCH) return;

    THEME_SWITCH.checked = BODY.getAttribute('data-theme') === 'dark';
    THEME_SWITCH.addEventListener('change', () => {
      themeApply(THEME_SWITCH.checked ? 'dark' : 'light');
    });
  }


  /* ==========================================================
     04. LIBRARY
     ========================================================== */

  const libraries = {};

  for (const key of Object.keys(LIBRARIES)) {
    libraries[key] = {
      state: 'idle',
      games: [],
      hasTitles: false,
      error: null,
      promise: null
    };
  }

  function fetchJsonOrNull(url) {
    return fetch(url, { mode: 'cors' })
      .then((res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch((err) => {
        console.warn(`[lib] ${url} unavailable: ${err.message}`);
        return null;
      });
  }

  function normalizeTitleSource(raw) {
    const out = new Map();
    if (!raw) return out;

    const clean = (s) => String(s || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const push = (tid, meta) => {
      if (!tid || !meta || typeof meta !== 'object') return;
      const id = cleanTid(tid);
      if (!id) return;

      const name      = clean(meta.name      || meta.Name      || meta.title    || meta.Title || '');
      const publisher = clean(meta.publisher || meta.Publisher || meta.company  || '');
      const icon      = meta.icon || meta.iconUrl || meta.icon_url || '';

      if (!name && !publisher && !icon) return;

      out.set(id, { name, publisher, icon });
    };

    const ingest = (list) => {
      for (const item of list) {
        if (!item) continue;
        const tid = item.TitleID || item.titleId || item.title_id
                 || item.tid     || item.id;
        push(tid, item);
      }
    };

    if (Array.isArray(raw)) {
      ingest(raw);
    } else if (typeof raw === 'object') {
      const inner = Array.isArray(raw.data)   ? raw.data
                  : Array.isArray(raw.titles) ? raw.titles
                  : null;
      if (inner) {
        ingest(inner);
      } else {
        for (const [tid, meta] of Object.entries(raw)) push(tid, meta);
      }
    }

    return out;
  }

  function loadLibrary(key) {
    const lib = libraries[key];
    if (!lib) return Promise.resolve();
    if (lib.state === 'ready') return Promise.resolve();
    if (lib.promise) return lib.promise;

    lib.state = 'loading';
    lib.error = null;
    renderLibrary(key);

    const cfg = LIBRARIES[key];

    const cheatFetches = cfg.cheatsUrls.map(fetchJsonOrNull);
    const titleFetches = cfg.titleSources.map(fetchJsonOrNull);

    lib.promise = Promise.all([...cheatFetches, ...titleFetches])
      .then((results) => {
        const cheatRaws = results.slice(0, cfg.cheatsUrls.length);
        const titleRaws = results.slice(cfg.cheatsUrls.length);

        const anyCheat = cheatRaws.some(Boolean);
        const anyTitle = titleRaws.some(Boolean);

        if (!anyCheat && !anyTitle) {
          throw new Error(
            `No data could be loaded for ${cfg.label}. ` +
            `Checked cheats: [${cfg.cheatsUrls.join(', ')}] ` +
            `and titles: [${cfg.titleSources.join(', ')}]`
          );
        }

        const cheatsMap = new Map();

        for (const raw of cheatRaws) {
          if (!raw) continue;

          let normalized;
          try {
            normalized = cfg.normalize(raw);
          } catch (err) {
            console.warn(
              `[lib] ${key}: one cheat source failed to normalize`, err
            );
            continue;
          }

          for (const entry of normalized) {
            const existing = cheatsMap.get(entry.tid) || [];
            const seen = new Set(existing.map((c) => c.name));

            for (const cheat of entry.cheats) {
              if (seen.has(cheat.name)) continue;
              existing.push(cheat);
              seen.add(cheat.name);
            }
            cheatsMap.set(entry.tid, existing);
          }
        }

        const titlesMap = new Map();

        for (const raw of titleRaws) {
          if (!raw) continue;

          for (const [tid, meta] of normalizeTitleSource(raw)) {
            const existing = titlesMap.get(tid) || {};
            titlesMap.set(tid, {
              name:      meta.name      || existing.name      || '',
              publisher: meta.publisher || existing.publisher || '',
              icon:      meta.icon      || existing.icon      || ''
            });
          }
        }

        const allTids = new Set([...cheatsMap.keys(), ...titlesMap.keys()]);

        /* GBA FIX: GBA "tids" are game names, so fall back to the tid itself
           instead of "Unknown (...)". */
        const isGba = cfg.platform === 'gba';

        lib.games = [...allTids].map((tid) => {
          const meta = titlesMap.get(tid) || {};
          const fallback = isGba ? tid : `Unknown (${tid})`;
          return {
            tid,
            name:      meta.name      || fallback,
            publisher: meta.publisher || '',
            icon:      meta.icon      || '',
            cheats:    cheatsMap.get(tid) || []
          };
        });

        lib.games.sort((a, b) => {
          const aU = a.name.startsWith('Unknown (');
          const bU = b.name.startsWith('Unknown (');
          if (aU !== bU) return aU ? 1 : -1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        lib.hasTitles = titlesMap.size > 0;
        lib.state     = 'ready';

        const withCheats = lib.games.filter((g) => g.cheats.length > 0).length;
        console.log(
          `[lib] ${key}: ${lib.games.length} titles indexed ` +
          `(${withCheats} with cheats, ${titlesMap.size} with metadata)`
        );

        renderLibrary(key);
      })
      .catch((err) => {
        console.error(`Library load failed for "${key}":`, err);
        lib.state = 'error';
        lib.error = err.message || 'Failed to load cheat database.';
        renderLibrary(key);
      })
      .finally(() => {
        lib.promise = null;
      });

    return lib.promise;
  }

  function searchLibrary(key, query, limit = SEARCH_LIMIT) {
    const lib = libraries[key];
    if (!lib || lib.state !== 'ready') return [];

    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results = [];
    for (const game of lib.games) {
      if (
        game.name.toLowerCase().includes(q) ||
        game.tid.toLowerCase().includes(q)  ||
        (game.publisher && game.publisher.toLowerCase().includes(q))
      ) {
        results.push(game);
        if (results.length >= limit) break;
      }
    }
    return results;
  }


  /* ==========================================================
     05. NLIB
     ========================================================== */

  const NLIB = {
    base: 'https://api.nlib.cc',
    cache: new Map(),
    inflight: new Map()
  };

  function nlibLookup(platform, tid) {
    const id = cleanTid(tid);
    const key = `nlib:${platform}:${id}`;

    if (NLIB.cache.has(key)) {
      const e = NLIB.cache.get(key);
      return e.state === 'ready'
        ? Promise.resolve(e.data)
        : Promise.reject(new Error(e.error || 'NLib lookup failed'));
    }
    if (NLIB.inflight.has(key)) return NLIB.inflight.get(key);

    const url = `${NLIB.base}/${platform}/${encodeURIComponent(id)}`;

    const promise = fetch(url, { method: 'GET', mode: 'cors' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`NLib HTTP ${res.status}`);
        const data = await res.json();
        NLIB.cache.set(key, { state: 'ready', data });
        NLIB.inflight.delete(key);
        return data;
      })
      .catch((err) => {
        NLIB.cache.set(key, { state: 'error', error: err.message });
        NLIB.inflight.delete(key);
        throw err;
      });

    NLIB.inflight.set(key, promise);
    return promise;
  }

  function nlibPick(data, keys) {
    if (!data || typeof data !== 'object') return '';
    const root = data.data || data.game || data.title || data;
    for (const k of keys) {
      const v = root[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return '';
  }

  function nlibCategories(data) {
    let cats =
      nlibPick(data, ['category', 'categories', 'genres', 'genre', 'tags']) || [];

    if (typeof cats === 'string') {
      cats = cats.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
    } else if (cats && typeof cats === 'object' && !Array.isArray(cats)) {
      cats = Object.values(cats);
    }
    if (!Array.isArray(cats)) return [];
    return cats.map((c) => String(c).trim()).filter(Boolean).slice(0, 6);
  }

  function pickImage(src, className, alt) {
    if (!src || typeof src !== 'string') return '';
    if (!/^(https?:|data:)/i.test(src)) return '';
    return `<img class="${className}" src="${escapeHtml(src)}"
                 alt="${escapeHtml(alt || '')}" loading="lazy"
                 referrerpolicy="no-referrer"
                 onerror="this.style.display='none'">`;
  }


  /* ==========================================================
     06. TABS & SEARCH UI
     ========================================================== */

  /* GBA FIX: added gba entry so typing in its search box doesn't throw. */
  const tabState = {
    switch: { view: 'idle', query: '', results: [], selected: null },
    '3ds':  { view: 'idle', query: '', results: [], selected: null },
    gba:    { view: 'idle', query: '', results: [], selected: null }
  };

  const TABS   = Array.from(document.querySelectorAll('.win-tab'));
  const PANELS = Array.from(document.querySelectorAll('.win-panel'));

  function activateTab(tabName) {
    TABS.forEach((btn) => {
      const on = btn.dataset.tab === tabName;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
    });

    PANELS.forEach((panel) => {
      const on = panel.dataset.panel === tabName;
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    });

    /* GBA FIX: lazily load whichever library this tab belongs to. */
    if (libraries[tabName] && libraries[tabName].state === 'idle') {
      loadLibrary(tabName);
    }
  }

  function bindTabKeyboard() {
    TABS.forEach((btn, i) => {
      btn.addEventListener('keydown', (e) => {
        let next = null;
        if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
        else if (e.key === 'ArrowLeft')  next = TABS[(i - 1 + TABS.length) % TABS.length];
        else if (e.key === 'Home') next = TABS[0];
        else if (e.key === 'End')  next = TABS[TABS.length - 1];
        if (!next) return;
        e.preventDefault();
        next.focus();
        activateTab(next.dataset.tab);
      });
    });

    TABS.forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
  }

  function bindSearchInput(key) {
    const cfg = LIBRARIES[key];
    const input = document.getElementById(cfg.searchId);
    const results = document.getElementById(cfg.resultsId);
    const clearBtn = document.querySelector(`[data-clear="${key}"]`);

    if (!input || !results) return;

    const run = debounce(() => {
      const q = input.value;
      tabState[key].query = q;
      tabState[key].view = 'results';
      tabState[key].selected = null;

      if (clearBtn) clearBtn.hidden = q.length === 0;

      if (libraries[key].state === 'ready') {
        tabState[key].results = searchLibrary(key, q);
      }
      renderLibrary(key);
    }, SEARCH_DEBOUNCE);

    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        input.value = '';
        run();
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      });
    }

    results.addEventListener('click', (e) => {
      const back = e.target.closest('.win-back');
      if (back) {
        tabState[key].view = 'results';
        tabState[key].selected = null;
        renderLibrary(key);
        return;
      }

      const copy = e.target.closest('.win-copy');
      if (copy) {
        copyToClipboard(copy.dataset.copy || '', copy);
        return;
      }

      const row = e.target.closest('.win-game');
      if (row) {
        const tid = row.dataset.tid;
        const game = libraries[key].games.find((g) => g.tid === tid);
        if (game) {
          tabState[key].selected = game;
          tabState[key].view = 'detail';
          renderLibrary(key);
        }
      }
    });
  }

  async function copyToClipboard(text, btn) {
    if (!text) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      flashCopied(btn);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }

  function flashCopied(btn) {
    const original = btn.innerHTML;
    btn.classList.add('is-copied');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
    setTimeout(() => {
      btn.classList.remove('is-copied');
      btn.innerHTML = original;
    }, 1500);
  }


  /* ---------- Rendering ---------- */

  function renderLibrary(key) {
    const cfg = LIBRARIES[key];
    const lib = libraries[key];
    const container = document.getElementById(cfg.resultsId);
    if (!container) return;

    const st = tabState[key];

    if (st.view === 'detail' && st.selected) {
      container.innerHTML = renderDetail(st.selected, cfg.platform);
      /* Only Switch / 3DS use the NLib fallback card. */
      if (cfg.platform !== 'gba' && st.selected.name.startsWith('Unknown (')) {
        hydrateNlibCard(container, cfg.platform, st.selected.tid);
      }
      return;
    }

    if (lib.state === 'loading') {
      container.innerHTML = `
        <div class="win-state">
          <span class="win-spinner" aria-hidden="true"></span>
          <span>Loading ${escapeHtml(cfg.label)} cheat database…</span>
        </div>`;
      return;
    }
    if (lib.state === 'error') {
      container.innerHTML = `
        <div class="win-state win-state--error">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          <span>${escapeHtml(lib.error || 'Could not load cheats.')}</span>
        </div>`;
      return;
    }

    if (!st.query || !st.query.trim()) {
      const cheatCount = lib.games.filter(
        (g) => Array.isArray(g.cheats) && g.cheats.length > 0
      ).length;

      container.innerHTML = `
        <div class="win-state">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <span>Search ${escapeHtml(cfg.label)} games by name or title ID</span>
          <small style="color:var(--text-faint);font-size:0.75rem">
            ${lib.games.length} titles indexed
            ${cheatCount ? `— ${cheatCount} with cheats` : ''}
          </small>
        </div>`;
      return;
    }

    if (!st.results.length) {
      container.innerHTML = `
        <div class="win-state">
          <i class="fa-regular fa-face-frown" aria-hidden="true"></i>
          <span>No games match “${escapeHtml(st.query)}”</span>
        </div>`;
      return;
    }

    container.innerHTML = st.results.map(renderGameRow).join('');
  }

  function renderGameRow(game) {
    const count = Array.isArray(game.cheats) ? game.cheats.length : 0;
    const hasCheats = count > 0;

    /* GBA FIX: don't repeat the name as a "title id". */
    const showTid = game.tid && game.tid !== game.name;

    const metaParts = [];
    if (showTid) {
      metaParts.push(`<span>${escapeHtml(game.tid)}</span>`);
      metaParts.push(`<span class="dot" aria-hidden="true"></span>`);
    }
    metaParts.push(
      hasCheats
        ? `<span>${count} cheat${count === 1 ? '' : 's'}</span>`
        : `<span class="win-game__none">no cheats</span>`
    );

    const chevron = hasCheats
      ? `<i class="fa-solid fa-chevron-right win-game__chev" aria-hidden="true"></i>`
      : `<i class="fa-solid fa-chevron-right win-game__chev win-game__chev--dim"
             aria-hidden="true"></i>`;

    return `
      <button type="button" class="win-game" data-tid="${escapeHtml(game.tid)}">
        <span class="win-game__info">
          <span class="win-game__name">${escapeHtml(game.name)}</span>
          <span class="win-game__meta">${metaParts.join('')}</span>
        </span>
        ${chevron}
      </button>`;
  }

  function renderDetail(game, platform) {
    const cheats = Array.isArray(game.cheats) ? game.cheats : [];
    const hasLocalMeta = !game.name.startsWith('Unknown (');
    const storeUrl = nintendoUrl(platform, game.tid, game.name);

    const metaCardHtml = hasLocalMeta
      ? `<div class="nlib-card nlib-card--local">
           <div class="nlib-card__body">
             <div class="nlib-card__info">
               <h4 class="nlib-card__title">${escapeHtml(game.name)}</h4>
               ${game.publisher
                 ? `<p class="nlib-card__publisher">${escapeHtml(game.publisher)}</p>`
                 : ''}
               ${storeUrl
                 ? `<a class="nlib-card__link nlib-card__link--store"
                       href="${escapeHtml(storeUrl)}"
                       target="_blank" rel="noopener">
                     View on Nintendo
                     <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                   </a>`
                 : ''}
             </div>
           </div>
         </div>`
      : `<div class="nlib-card" data-meta-tid="${escapeHtml(game.tid)}">
           <div class="nlib-card__state">
             <span class="win-spinner" aria-hidden="true"></span>
             <span>Loading info…</span>
           </div>
         </div>`;

    const cheatsHtml = cheats.length
      ? cheats.map((c, i) => renderCheatBlock(c, i)).join('')
      : `<div class="win-state win-state--empty">
           <i class="fa-regular fa-face-frown" aria-hidden="true"></i>
           <span>No Cheats Found</span>
           <small style="color:var(--text-faint);font-size:0.75rem;margin-top:0.25rem">
             This title isn't in the cheat database yet.
           </small>
         </div>`;

    return `
      <div class="win-detail__head">
        <button type="button" class="win-back">
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
          <span>Back</span>
        </button>
        <div class="win-detail__title">
          <h3 class="win-detail__name">${escapeHtml(game.name)}</h3>
          ${game.tid && game.tid !== game.name
            ? `<span class="win-detail__id">${escapeHtml(game.tid)}</span>`
            : ''}
        </div>
      </div>
      ${metaCardHtml}
      ${cheatsHtml}`;
  }

  function renderCheatBlock(cheat, index) {
    const name = cheat.name || `Cheat #${index + 1}`;

    let lines = [];
    if (Array.isArray(cheat.codes))            lines = cheat.codes;
    else if (typeof cheat.codes === 'string')  lines = cheat.codes.split('\n');
    else if (typeof cheat.code  === 'string')  lines = cheat.code.split('\n');

    const text     = lines.join('\n');
    const safeName = escapeHtml(name);
    const safeText = escapeHtml(text);

    const buildChip = cheat.buildId
      ? `<span class="badge badge--ok" title="Build ID"
               style="margin-left:.4rem;font-size:.65rem;letter-spacing:.02em">
           ${escapeHtml(cheat.buildId.slice(0, 7))}
         </span>`
      : '';

    return `
      <div class="win-cheat">
        <div class="win-cheat__name">
          <span>${safeName}${buildChip}</span>
          <button type="button" class="win-copy"
                  data-copy="${safeText.replace(/"/g, '&quot;')}"
                  aria-label="Copy cheat code">
            <i class="fa-regular fa-copy" aria-hidden="true"></i>
            <span>Copy</span>
          </button>
        </div>
        <pre>${safeText}</pre>
      </div>`;
  }


  /* ==========================================================
     NLIB — hydrate fallback card
     ========================================================== */

  function hydrateNlibCard(container, platform, tid) {
    const card = container.querySelector('.nlib-card[data-meta-tid]');
    if (!card) return;

    nlibLookup(platform, tid)
      .then((data) => {
        if (!card.isConnected) return;

        const title     = nlibPick(data, ['name', 'title', 'game_name', 'formal_name']);
        const publisher = nlibPick(data, ['publisher', 'company', 'developer']);
        const version   = nlibPick(data, ['version', 'display_version']);
        const release   = nlibPick(data, ['release_date', 'releaseDate', 'release']);
        const desc      = nlibPick(data, ['description', 'summary', 'intro']);
        const icon      = nlibPick(data, ['icon', 'icon_url', 'iconUrl', 'image']);
        const banner    = nlibPick(data, ['banner', 'banner_url', 'bannerUrl']);
        const cats      = nlibCategories(data);

        if (!title && !publisher && !icon && !banner && !cats.length) {
          renderNlibEmpty(card, platform, tid);
          return;
        }

        const iconHtml   = pickImage(icon,   'nlib-card__icon',   title);
        const bannerHtml = pickImage(banner, 'nlib-card__banner', title);

        const catsHtml = cats.length
          ? `<div class="nlib-card__cats">
               ${cats.map((c) => `<span class="nlib-card__cat">${escapeHtml(c)}</span>`).join('')}
             </div>`
          : '';

        const metaBits = [];
        if (version) metaBits.push(`<span>v${escapeHtml(version)}</span>`);
        if (release) metaBits.push(`<span>${escapeHtml(release)}</span>`);
        const metaHtml = metaBits.length
          ? `<div class="nlib-card__meta">${metaBits.join('')}</div>`
          : '';

        const descHtml = desc
          ? `<p class="nlib-card__desc">${escapeHtml(desc)}</p>`
          : '';

        const storeUrl = nintendoUrl(platform, tid, title || '');

        card.classList.remove('nlib-card--empty', 'nlib-card--error');
        card.innerHTML = `
          ${bannerHtml}
          <div class="nlib-card__body">
            ${iconHtml}
            <div class="nlib-card__info">
              ${title
                ? `<h4 class="nlib-card__title">${escapeHtml(title)}<span class="nlib-card__source">nlib</span></h4>`
                : ''}
              ${publisher ? `<p class="nlib-card__publisher">${escapeHtml(publisher)}</p>` : ''}
              ${catsHtml}
              ${metaHtml}
              ${descHtml}
              ${storeUrl
                ? `<a class="nlib-card__link nlib-card__link--store"
                       href="${escapeHtml(storeUrl)}"
                       target="_blank" rel="noopener">
                     View on Nintendo
                     <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                   </a>`
                : ''}
            </div>
          </div>`;
      })
      .catch((err) => {
        if (!card.isConnected) return;
        renderNlibEmpty(card, platform, tid, err);
      });
  }

  function renderNlibEmpty(card, platform, tid, err) {
    card.classList.add('nlib-card--empty');
    const quiet = !err || /404|not found/i.test(err.message || '');

    card.innerHTML = `
      <div class="nlib-card__state">
        <i class="fa-solid ${quiet ? 'fa-circle-info' : 'fa-triangle-exclamation'}"
           aria-hidden="true"></i>
        <span>${
          quiet
            ? 'No additional metadata available for this title.'
            : `Metadata unavailable (${escapeHtml(err.message || 'network error')}).`
        }</span>
      </div>
      <div class="nlib-card__state" style="padding-top:0">
        <a class="nlib-card__link" target="_blank" rel="noopener"
           href="https://nlib.cc/${platform}/${encodeURIComponent(tid)}">
          Look up on nlib.cc
          <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </a>
      </div>`;
  }


  /* ==========================================================
     07. BOOT
     ========================================================== */

  function init() {
    themeInit();

    if (window.WindowManager && typeof window.WindowManager.init === 'function') {
      window.WindowManager.init();
    }

    bindTabKeyboard();
    bindSearchInput('switch');
    bindSearchInput('3ds');
    /* GBA FIX: wire up the GBA search box too. */
    bindSearchInput('gba');

    activateTab('switch');

    window.CheatWindow = {
      open:   window.WindowManager ? window.WindowManager.open   : () => {},
      close:  window.WindowManager ? window.WindowManager.close  : () => {},
      toggle: window.WindowManager ? window.WindowManager.toggle : () => {},
      tabs:   activateTab,
      state:  window.WindowManager ? window.WindowManager.state  : null,
      libs:   LIBRARIES,
      nlib:   nlibLookup,
      load:   loadLibrary
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();