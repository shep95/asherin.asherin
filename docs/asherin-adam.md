# asherin.adam

the live globe room. it is the ADAM console (shep95/adam) built as a static
bundle under `public/adam/` and shown in a same-origin iframe by
`src/components/dashboard/adam/AsherinAdamView.tsx`. nothing from the console
is imported into the react tree: it owns a whole page (fixed element ids,
body-level overlays, a capture guard that patches `getDisplayMedia` and
`captureStream` non-configurably), so a frame is the only honest boundary.

## what the bundle keeps

asherin has no gateway, so every `/api/*`-backed layer, panel, chip and
control was pruned at the entry point in the ADAM checkout
(`src/embed/profile.js`, built with `vite build -c embed/vite.config.js`):

- kept: esri world imagery and osm base maps, esri / nasa gibs / gebco /
  openseamap overlays, keyless terrain (terrain.reearth.land), usgs
  earthquakes, nasa recent imagery (cmr / worldview), the photon geocoder,
  bundled geojson (data centres, dams, submarine cables, airspace firs, city
  presets), the sky panel (sun, moon, time; current conditions straight from
  open-meteo, asked only while the panel is open, at 0.01° precision), the
  astro panel, display styles, measure, snapshot/record, settings (vendored
  geist fonts only).
- removed: flights, military, ais, satellites, launches, cctv, radio, traffic,
  transit, bikeshare, alpr, installations, directions, fires, weather radar /
  wind / lightning / cyclones, infra-context overlays, every intel panel that
  needs a server (news, markets, places, crime, resources, leaders, infra,
  ledger, trace, lora, volcanoes, space, spectrum, history, session, symbols,
  streams, osint, imagery, captures, 3d models), nations, the shepherd chat
  room, voice control, power up, provider settings, settings → ai keys.
- demo payloads (`public/captures`, `public/events`, `public/models`) are not
  shipped; no cesium ion or google key is compiled in, so the globe runs on
  the keyless path (`body.adam-no-ion`).

## headers

`vercel.json` applies `frame-ancestors 'none'` and `X-Frame-Options: DENY`
to every path. a later rule for `/adam/:path*` sets `frame-ancestors 'self'`
and `X-Frame-Options: SAMEORIGIN`. vercel applies every matching rule and the
later value wins for a duplicated key, so only the globe becomes frameable,
and only by this origin. the pattern must match `/adam` itself: with
`cleanUrls` on, the frame's `/adam/index.html` is redirected to `/adam`, and a
`/adam/(.*)` rule would leave that document under the site-wide `DENY`.

caching follows the same order: everything under `/adam` keeps a day,
`/adam/assets/*` (content-hashed) a year and immutable, and the document itself
(`/adam`, `/adam/index.html`) `no-cache`, so a redeploy never leaves a cached
page pointing at hashed files that are gone.

the bundle's `index.html` carries no inline script (the launch hash moved into
its entry module) and no meta csp of its own, so asherin's served policy is the
one that applies inside the frame.

## rebuilding

the embed profile is a set of changes on top of `shep95/adam` at `0aa5db6`, kept here as
`docs/asherin-adam/embed.patch` so the bundle can be rebuilt from source:

```
git clone https://github.com/shep95/adam && cd adam && git checkout 0aa5db6
git apply ../asherin/docs/asherin-adam/embed.patch
PUPPETEER_SKIP_DOWNLOAD=1 npm ci && npx vite build -c embed/vite.config.js
rm -rf asherin/public/adam && mkdir asherin/public/adam
cp -r dist-embed/{assets,brand,fonts,index.html,*.svg} asherin/public/adam/
cp -r dist-embed/adam/cesium asherin/public/adam/cesium
```
