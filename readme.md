# NCheats — 3DS · Switch · GBA

A static, dependency-light browser library for cheat codes on Nintendo 3DS, Nintendo Switch and Game Boy Advance. Search a bundled dataset, copy a code block, or consume the same versioned records through the read-only JSON API.

The site has no app backend, account or tracking. Preferences are stored locally in the browser. The API consists of static JSON files served by GitHub Pages.

## Features

- Instant search by game title, title ID or publisher.
- Switch, 3DS and GBA libraries in one draggable, resizable and minimizable window.
- Ecosystem appearance controls: Default, Cyberpunk, Discord, Solo Leveling, Xbox 360 and Windows XP skins; dark and light modes; four palettes for each skin.
- Theme preference persistence, keyboard-visible focus and reduced-motion support.
- One-click copy for each cheat block.
- Versioned JSON API with per-platform datasets for the complete library plus an OpenAPI 3.1 description.
- Custom NCheats SVG brand icon.

## Use the website

1. Select **Open cheat library** or **Browse cheat library**.
2. Pick Switch, 3DS or GBA.
3. Search by game name (or title ID for Switch/3DS).
4. Select a game, then copy a code block.

On Switch and 3DS, title IDs are searchable (for example, `010099B00A2DC000`).

## JSON API

Base URL: `https://mrjuaumbr.github.io/NCheats/api/v1/`

- `index.json` — API version, generation timestamp, dataset counts and endpoint URLs.
- `platforms/switch.json` — Switch.
- `platforms/3ds.json` — 3DS.
- `platforms/gba.json` — GBA.
- `openapi.json` — OpenAPI 3.1 specification.

This is a read-only static API. It does not evaluate query parameters, filter, paginate, search or accept writes. The three platform endpoints together contain every bundled cheat; fetch one or all three and filter the returned `games` arrays in your client. Start with the [API documentation](api/README.md).

After changing the source datasets, regenerate the snapshots with:

```sh
node scripts/build-api.js
```

The generator refreshes the current public blawar/titledb Switch fallback at build time. It requires Node.js 18+ and network access to that source. The generated `api/v1/` files are the deployable API; no server process is needed at runtime.

## Data and credits

| Platform | Cheat-code sources | Title metadata |
| --- | --- | --- |
| Switch | [FlagBrew / Sharkive](https://github.com/FlagBrew/Sharkive) and [blawar / titledb](https://github.com/blawar/titledb) | Bundled title snapshot |
| 3DS | [FlagBrew / Sharkive](https://github.com/FlagBrew/Sharkive) | Bundled title snapshot, including [3DSDB](https://github.com/ghost-land/3dsdb) data |
| GBA | [RetroArch / libretro-database](https://www.libretro.com/) (community-aggregated) | Game names from the source dataset |

## Dependencies

| Library | Version | Purpose | Loaded where | Fallback |
| --- | --- | --- | --- | --- |
| [Bootstrap](https://getbootstrap.com/) | 5.0.2 (pinned with SRI) | Container/utilities and responsive navigation collapse | Home page and API docs CSS; JavaScript only on the home page | Semantic links and project CSS |
| [Font Awesome](https://fontawesome.com/) | 6.4.2 (pinned with SRI) | Functional and decorative icons | Both pages | Adjacent text labels or hidden decorative icons |

No jQuery is used. Source projects retain their own licenses and terms; see those repositories for details.

## Disclaimer

This project is not affiliated with Nintendo. Cheat codes are provided as-is for use with modded consoles or emulators. Using cheats may violate platform terms or corrupt save data; back up your saves and use the codes at your own risk.
