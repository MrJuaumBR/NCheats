'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalize3DS, normalizeGBA, normalizeSwitch } = require('../static/js/normalizeCheats.js');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'static', 'data');
const OUTPUT = path.join(ROOT, 'api', 'v1');
const SITE = 'https://mrjuaumbr.github.io/NCheats';
const SWITCH_FALLBACK_URL = 'https://raw.githubusercontent.com/blawar/titledb/refs/heads/master/cheats.json';

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(INPUT, file), 'utf8'));
}

function writeJson(file, value) {
  const destination = path.join(OUTPUT, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(value)}\n`);
}

function cleanText(value) {
  return String(value == null ? '' : value)
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleMap(raw) {
  const result = new Map();
  const add = (id, meta) => {
    if (!id || !meta || typeof meta !== 'object') return;
    const key = cleanText(id).replace(/\s+/g, '').toUpperCase();
    if (!key) return;
    const name = cleanText(meta.name || meta.Name || meta.title || meta.Title || '');
    const publisher = cleanText(meta.publisher || meta.Publisher || meta.company || '');
    const icon = meta.icon || meta.iconUrl || meta.icon_url || '';
    if (name || publisher || icon) result.set(key, { name, publisher, icon });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      add(item.TitleID || item.titleId || item.title_id || item.tid || item.id, item);
    }
  } else if (raw && typeof raw === 'object') {
    const list = Array.isArray(raw.data) ? raw.data : Array.isArray(raw.titles) ? raw.titles : null;
    if (list) {
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        add(item.TitleID || item.titleId || item.title_id || item.tid || item.id, item);
      }
    } else {
      for (const [id, meta] of Object.entries(raw)) add(id, meta);
    }
  }
  return result;
}

function mergeNormalized(groups) {
  const merged = new Map();
  for (const entries of groups) {
    for (const entry of entries) {
      const id = String(entry.tid || '').trim();
      if (!id) continue;
      const current = merged.get(id) || { tid: id, cheats: [] };
      const seen = new Set(current.cheats.map((cheat) => cheat.name));
      for (const cheat of Array.isArray(entry.cheats) ? entry.cheats : []) {
        if (seen.has(cheat.name)) continue;
        current.cheats.push(cheat);
        seen.add(cheat.name);
      }
      merged.set(id, current);
    }
  }
  return [...merged.values()];
}

async function fetchSwitchFallback() {
  if (typeof fetch !== 'function') throw new Error('Node.js 18 or newer is required to fetch the Switch fallback dataset.');
  const response = await fetch(SWITCH_FALLBACK_URL, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Could not refresh the Switch fallback dataset (HTTP ${response.status}).`);
  return response.json();
}

async function buildApi() {
  const generatedAt = new Date().toISOString();
  const switchFallback = await fetchSwitchFallback();
  const configs = [
    {
      id: 'switch', name: 'Nintendo Switch', code: 'nx', dataFile: 'switch.json',
      titlesFile: 'switch-titles.json', source: ['FlagBrew / Sharkive', 'blawar / titledb'],
      normalize: (raw) => mergeNormalized([normalizeSwitch(raw), normalizeSwitch(switchFallback)])
    },
    {
      id: '3ds', name: 'Nintendo 3DS', code: 'ctr', dataFile: '3ds.json',
      titlesFile: '3ds-titles.json', source: ['FlagBrew / Sharkive'], normalize: normalize3DS
    },
    {
      id: 'gba', name: 'Game Boy Advance', code: 'gba', dataFile: 'gba.json',
      titlesFile: null, source: ['RetroArch / libretro-database'], normalize: normalizeGBA
    }
  ];

  const platforms = configs.map((config) => {
    const entries = config.normalize(readJson(config.dataFile)).filter((entry) =>
      Array.isArray(entry.cheats) && entry.cheats.some((cheat) =>
        Array.isArray(cheat.codes) && cheat.codes.some((code) => String(code).trim())
      )
    );
    const titles = config.titlesFile ? titleMap(readJson(config.titlesFile)) : new Map();
    const games = entries.map((entry) => {
      const id = String(entry.tid || '').trim();
      const key = id.replace(/\s+/g, '').toUpperCase();
      const meta = titles.get(key) || {};
      const fallback = config.id === 'gba' ? id : `Unknown (${id})`;
      return {
        id,
        name: meta.name || fallback,
        publisher: meta.publisher || '',
        ...(meta.icon ? { icon: meta.icon } : {}),
        cheats: (Array.isArray(entry.cheats) ? entry.cheats : []).map((cheat) => ({
          name: String(cheat.name || 'Cheat'),
          codes: Array.isArray(cheat.codes) ? cheat.codes.map(String) : [],
          ...(cheat.buildId ? { buildId: String(cheat.buildId) } : {})
        }))
      };
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const gamesWithCheats = games.filter((game) => game.cheats.length > 0).length;
    const totalCheats = games.reduce((sum, game) => sum + game.cheats.length, 0);
    return {
      id: config.id,
      name: config.name,
      code: config.code,
      source: config.source,
      count: { games: games.length, gamesWithCheats, cheats: totalCheats },
      games
    };
  });

  const combinedGames = platforms.flatMap((platform) => platform.games.map((game) => ({
    ...game,
    platform: platform.id
  })));
  const totals = platforms.reduce((sum, platform) => ({
    games: sum.games + platform.count.games,
    gamesWithCheats: sum.gamesWithCheats + platform.count.gamesWithCheats,
    cheats: sum.cheats + platform.count.cheats
  }), { games: 0, gamesWithCheats: 0, cheats: 0 });

  const apiIndex = {
    apiVersion: '1.0.0',
    generatedAt,
    readOnly: true,
    hosting: 'Static JSON files on GitHub Pages; query parameters are not server-side filters.',
    count: totals,
    endpoints: {
      all: `${SITE}/api/v1/cheats.json`,
      switch: `${SITE}/api/v1/platforms/switch.json`,
      '3ds': `${SITE}/api/v1/platforms/3ds.json`,
      gba: `${SITE}/api/v1/platforms/gba.json`,
      openapi: `${SITE}/api/v1/openapi.json`
    }
  };

  fs.mkdirSync(OUTPUT, { recursive: true });
  writeJson('index.json', apiIndex);
  writeJson('cheats.json', {
    apiVersion: '1.0.0', generatedAt, count: totals,
    platforms: platforms.map(({ games, ...summary }) => summary), games: combinedGames
  });
  for (const platform of platforms) {
    writeJson(`platforms/${platform.id}.json`, { apiVersion: '1.0.0', generatedAt, ...platform });
  }

  const jsonResponse = (schema) => ({
    description: 'Static JSON response',
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } }
  });
  const getPath = (summary, schema, operationId) => ({
    get: { summary, operationId, responses: { '200': jsonResponse(schema) } }
  });
  writeJson('openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'NCheats JSON API', version: '1.0.0',
      description: 'Read-only static JSON snapshots. Query parameters are not server-side filters.'
    },
    servers: [{ url: `${SITE}/api/v1` }],
    paths: {
      '/index.json': getPath('Get API version and dataset index', 'ApiIndex', 'getApiIndex'),
      '/cheats.json': getPath('Get all bundled games and cheats across platforms', 'CombinedDataset', 'getAllCheats'),
      '/platforms/switch.json': getPath('Get Nintendo Switch game and cheat records', 'PlatformDataset', 'getSwitchCheats'),
      '/platforms/3ds.json': getPath('Get Nintendo 3DS game and cheat records', 'PlatformDataset', 'get3dsCheats'),
      '/platforms/gba.json': getPath('Get Game Boy Advance game and cheat records', 'PlatformDataset', 'getGbaCheats')
    },
    components: {
      schemas: {
        Count: {
          type: 'object', required: ['games', 'gamesWithCheats', 'cheats'],
          properties: {
            games: { type: 'integer' }, gamesWithCheats: { type: 'integer' }, cheats: { type: 'integer' }
          }
        },
        ApiIndex: {
          type: 'object', required: ['apiVersion', 'generatedAt', 'readOnly', 'count', 'endpoints'],
          properties: {
            apiVersion: { type: 'string' }, generatedAt: { type: 'string', format: 'date-time' },
            readOnly: { type: 'boolean' }, count: { $ref: '#/components/schemas/Count' },
            endpoints: { type: 'object', additionalProperties: { type: 'string', format: 'uri' } }
          }
        },
        PlatformSummary: {
          type: 'object', required: ['id', 'name', 'count'],
          properties: {
            id: { type: 'string', enum: ['switch', '3ds', 'gba'] }, name: { type: 'string' },
            count: { $ref: '#/components/schemas/Count' }
          }
        },
        CombinedDataset: {
          type: 'object', required: ['apiVersion', 'generatedAt', 'count', 'platforms', 'games'],
          properties: {
            apiVersion: { type: 'string' }, generatedAt: { type: 'string', format: 'date-time' },
            count: { $ref: '#/components/schemas/Count' },
            platforms: { type: 'array', items: { $ref: '#/components/schemas/PlatformSummary' } },
            games: { type: 'array', items: { $ref: '#/components/schemas/Game' } }
          }
        },
        PlatformDataset: {
          type: 'object', required: ['apiVersion', 'generatedAt', 'id', 'name', 'count', 'games'],
          properties: {
            apiVersion: { type: 'string' }, generatedAt: { type: 'string', format: 'date-time' },
            id: { type: 'string', enum: ['switch', '3ds', 'gba'] }, name: { type: 'string' },
            code: { type: 'string' }, source: { type: 'array', items: { type: 'string' } },
            count: { $ref: '#/components/schemas/Count' },
            games: { type: 'array', items: { $ref: '#/components/schemas/Game' } }
          }
        },
        Game: {
          type: 'object', required: ['id', 'name', 'publisher', 'cheats'],
          properties: {
            id: { type: 'string' }, name: { type: 'string' }, publisher: { type: 'string' },
            platform: { type: 'string', enum: ['switch', '3ds', 'gba'] },
            icon: { type: 'string', format: 'uri' },
            cheats: { type: 'array', items: { $ref: '#/components/schemas/Cheat' } }
          }
        },
        Cheat: {
          type: 'object', required: ['name', 'codes'],
          properties: {
            name: { type: 'string' }, codes: { type: 'array', items: { type: 'string' } },
            buildId: { type: 'string' }
          }
        }
      }
    }
  });

  console.log(`Built API v1: ${totals.games} games, ${totals.gamesWithCheats} with cheats, ${totals.cheats} cheat entries.`);
  console.log(`Output: ${path.relative(ROOT, OUTPUT)}`);
}

buildApi().catch((error) => {
  console.error(`API build failed: ${error.message}`);
  process.exitCode = 1;
});
