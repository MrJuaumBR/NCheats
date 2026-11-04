# NCheats JSON API

This API is a versioned collection of static JSON files hosted alongside NCheats on GitHub Pages. It is read-only and needs no API key. Because it is static hosting, query parameters do not perform server-side filtering and there are no write, search, pagination, or dynamic lookup routes. Download a platform document or the combined document and filter the returned `games` array in your client.

## Endpoints

The public base is `https://mrjuaumbr.github.io/NCheats/api/v1/`.

- `GET index.json` — API version, dataset counts, and endpoint URLs.
- `GET cheats.json` — all Switch, 3DS, and GBA game records in one JSON document. Each game has a `platform` field.
- `GET platforms/switch.json` — Switch records.
- `GET platforms/3ds.json` — 3DS records.
- `GET platforms/gba.json` — GBA records.
- `GET openapi.json` — OpenAPI 3.1 description of the endpoints.

Each game record uses `id`, `name`, `publisher`, optional `icon`, and `cheats`. Each cheat has `name`, an array of `codes`, and an optional Switch `buildId`. `count` fields summarize the number of games, games with cheats, and cheat entries. Empty `publisher` strings are intentional when no title metadata is available.

## Examples

```sh
curl https://mrjuaumbr.github.io/NCheats/api/v1/platforms/switch.json
```

```js
const response = await fetch('https://mrjuaumbr.github.io/NCheats/api/v1/platforms/switch.json');
if (!response.ok) throw new Error(`NCheats API returned HTTP ${response.status}`);
const data = await response.json();
const matches = data.games.filter((game) => game.name.toLowerCase().includes('mario'));
```

## Refreshing the snapshots

The checked-in API files are generated from `static/data/`, the website's normalizers, and the current public Switch fallback at `https://raw.githubusercontent.com/blawar/titledb/refs/heads/master/cheats.json`. After updating data, run:

```sh
node scripts/build-api.js
```

The generator needs Node.js 18+ and network access to refresh that fallback; a successful run writes all deployable files under `api/v1/`. Review the outputs and commit the refreshed API files with the corresponding source-data update. No server process is needed at runtime.

## Data and attribution

Switch cheat records include FlagBrew / Sharkive and blawar / titledb data. 3DS cheat records are attributed to FlagBrew / Sharkive. GBA cheat records are from the community-aggregated RetroArch / libretro-database. Title metadata is included where available. See the source projects for their licenses and terms; NCheats is not affiliated with Nintendo. Use the codes at your own risk.
