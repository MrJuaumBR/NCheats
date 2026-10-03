/* ==========================================================
   Sharkive / libretro normalizers — tuned to the actual file shapes
   ========================================================== */

/**
 * 3DS file:
 *   { "0004000000148500": { "99999 Tres Collected": ["...","..."], ... } }
 * Returns: [{ tid, cheats: [{ name, codes }] }, ...]
 */
function normalize3DS(raw) {
  const out = [];
  for (const [tid, cheats] of Object.entries(raw)) {
    if (!cheats || typeof cheats !== 'object') continue;
    const list = [];
    for (const [name, lines] of Object.entries(cheats)) {
      list.push({
        name,
        codes: Array.isArray(lines) ? lines.slice() : [String(lines)]
      });
    }
    out.push({ tid: tid.toUpperCase(), cheats: list });
  }
  return out;
}

/**
 * Switch file:
 *   { "010099B00A2DC000": { "<buildId>": { "P1 Infinite Lives": ["..."], ... } } }
 *
 * Flattens the buildId layer. Cheats with the same name across builds are
 * deduped (first build wins) so the same cheat doesn't appear N times.
 * Returns: [{ tid, cheats: [{ name, codes, buildId }] }, ...]
 */
function normalizeSwitch(raw) {
  const out = [];
  if (!raw || typeof raw !== 'object') return out;

  for (const [tid, builds] of Object.entries(raw)) {
    if (!builds || typeof builds !== 'object') continue;

    const seen = new Map(); // cheatName -> { name, codes, buildId }

    for (const [buildId, cheats] of Object.entries(builds)) {
      if (!cheats) continue;

      /* -------------------------------------------------
         Case A: array of { title, source }  (blawar/titledb)
         Case B: object map { "Name": ["code", ...] }  (Sharkive)
         ------------------------------------------------- */
      const entries = Array.isArray(cheats)
        ? cheats.map((c) => ({
            name:   c && (c.title || c.name),
            source: c && (c.source || c.codes || c.code)
          }))
        : Object.entries(cheats).map(([name, val]) => {
            if (val && typeof val === 'object' && !Array.isArray(val)) {
              return {
                name:   val.title  || val.name  || name,
                source: val.source || val.codes || val.code || ''
              };
            }
            return { name, source: val };
          });

      for (const { name, source } of entries) {
        if (!name || seen.has(name)) continue;

        let codes = [];
        if (Array.isArray(source)) {
          codes = source.slice();
        } else if (typeof source === 'string') {
          codes = source.split('\n').map((l) => l.trimEnd());
        }

        while (codes.length && codes[0].trim() === '') codes.shift();
        while (codes.length && codes[codes.length - 1].trim() === '') codes.pop();

        seen.set(name, { name, codes, buildId });
      }
    }

    out.push({ tid: tid.toUpperCase(), cheats: [...seen.values()] });
  }
  return out;
}

/* ----------------------------------------------------------
   GBA helpers
   ---------------------------------------------------------- */

/**
 * libretro GBA cheat entries store their code as a single string with
 * parts joined by `+`, e.g.:
 *   "8201A454+07B7"            -> one line:  "8201A454 07B7"
 *   "000084F5+000A+100193C0+0007" -> two lines:
 *                                     "000084F5 000A"
 *                                     "100193C0 0007"
 * Some entries ship with stray wrapping quotes — strip those too.
 */
function formatGbaCode(code) {
  if (typeof code !== 'string') return [];

  const s = code.trim().replace(/^["'\s]+|["'\s]+$/g, '');
  if (!s) return [];

  // No `+` -> single-token code (rare, e.g. GameShark "54EA36996E4A")
  if (!s.includes('+')) return [s];

  const parts = s.split('+').map((p) => p.trim()).filter(Boolean);
  const lines = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push(
      i + 1 < parts.length ? parts[i] + ' ' + parts[i + 1] : parts[i]
    );
  }
  return lines;
}

/**
 * GBA file (RetroArch / libretro-database shape):
 *   {
 *     "platform": "gba",
 *     "source":   "...",
 *     "gameCount": 512,
 *     "games": {
 *       "007 - Everything or Nothing (World) (Code Breaker)": [
 *         { "desc": "Infinite Health", "code": "3200E924+0096", "parts": [...] },
 *         ...
 *       ],
 *       ...
 *     }
 *   }
 *
 * The bare map form `{ "Game": [ {...} ] }` is also accepted.
 * Returns: [{ tid, cheats: [{ name, codes }] }, ...]
 */
function normalizeGBA(raw) {
  const out = [];
  if (!raw || typeof raw !== 'object') return out;

  const games =
    raw.games && typeof raw.games === 'object' && !Array.isArray(raw.games)
      ? raw.games
      : raw;

  for (const [gameName, cheats] of Object.entries(games)) {
    if (!Array.isArray(cheats)) continue;

    const list = [];
    for (const c of cheats) {
      if (!c || typeof c !== 'object') continue;

      const name = c.desc || c.name || c.title || 'Cheat';

      let codes = [];
      if (Array.isArray(c.codes))          codes = c.codes.slice();
      else if (typeof c.code  === 'string') codes = formatGbaCode(c.code);
      else if (typeof c.codes === 'string') codes = formatGbaCode(c.codes);

      if (!codes.length) continue;
      list.push({ name, codes });
    }

    if (!list.length) continue;
    out.push({ tid: gameName, cheats: list });
  }

  return out;
}