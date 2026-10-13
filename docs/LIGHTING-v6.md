# Dynamic lighting (v6 #76) — design

Goal: spells and glowing sand are light emitters; nearby sprites/terrain are lit (diffuse + rim + soft glow) and cast perspective-correct shadows. Extends js/render/gl.js (WebGL2 compositor); the 2D path (js/render/light.js cell lights) stays as the fallback and as "Lighting: Off".

## Architecture
- Render passes (gl.js): [terrain albedo] [terrain normal+height] [sprites albedo] [sprites normal+height] -> lighting pass -> Bayer quantise (existing) -> fog/HUD. The normal+height target is RGBA8: RG = normal xy (0..1), B = height (0..1, 0 = ground), A = material (0 ground, 1 unit, 2 tree/cliff, 3 emissive).
- Light list (L1, js/render/lights.js): `IT.Lights.add({x,y,z,r,g,b,radius,intensity,kind})` per frame from fx.js/particles/sand/spells: orbs (3 per Invoker, colour by orb), Forge Spirits, Sun Strike beam, Meteor (moving), EMP, Tornado, Ice Wall sheen, TP column, torches/braziers on buildings, relic/aghs sand (clustered: k-means-lite into <= 4 lights). Cap 32 lights (uniform array), sorted by screen-space contribution; day/night ambient from js/data/daynight.js.
- Normals (L2, js/render/normals.js): bake-time for every IT.Art.sheet frame: alpha silhouette -> signed distance (8SSEDT) -> "pillow" normal (gradient of the distance, z from a dome profile), packed next to the albedo atlas; terrain normals/height from the heightmap (js/data/dotaworld.js elevation tiers + cliff edges from terrain.js edgeKind) into a second cached canvas (same cache lifetime as the terrain canvas).
- Shader (L3, gl.js): for each pixel: N from the G-buffer, h = height; for each light: L = light - (p, h), attenuation = smooth (1 - d/radius)^2 scaled by intensity; diffuse = max(0, N.L); rim = pow(1 - max(0, N.V), 3) * max(0, N.L) * rimK (V = up); glow = soft additive splat of the light colour (radius x 0.6); result = albedo * (ambient + sum diffuse) + rim + glow; quantise by the existing Bayer matrix so the look stays pixel-art (4 shade steps). Half-res light buffer on Low.
- Shadows (L4): per unit/structure/tree: a skewed silhouette quad (sprite drawn black at alpha 0.35, sheared away from the 1-2 strongest lights within radius; length = height / lightHeight x distance, skew by the light direction) drawn into a shadow buffer before the lighting pass (so shadows darken the ground, never the caster). Cliffs/trees: a 6-step heightmap ray-march in the shader toward each strong light (sample the height channel), High only.
- Settings (L5): Lighting Off/Low/High (settings.js, default Low; Off = today's 2D cell lights); perf budget 60 fps @1920x1080 with the full tree count: cap lights by distance to the camera, LOD: sprites below 6 px skip normals, tree shadows batched per chunk. Reduced-motion does not affect lighting.

## Art rules
- Lights never exceed the orb palette (Quas cyan, Wex magenta, Exort orange), Sun Strike gold, Meteor orange-red, EMP violet, sand gold; intensity so that mid-day lighting is subtle (+15% max) and night is dramatic (+60%).
- Rim only on units/trees (material 1-2), never on ground; keep readability: HP bars, status rows and text are drawn after lighting.
- Fog outside vision stays unlit (fog pass after lighting).

## Packages
- L1 (sonnet): js/render/lights.js + emitters wired in fx.js/particles.js/sand.js/units.js (orbs) + tests (list cap, clustering, sorting).
- L2 (sonnet): js/render/normals.js (8SSEDT + pillow), terrain normal/height canvas in terrain.js, atlas packing in gl.js; tests on a synthetic sprite (normals point outward, z>0 inside).
- L3 (opus): gl.js lighting pass + shader, Bayer quantise, day/night ambient, half-res path; headless shader-string tests + a browser screenshot.
- L4 (opus): shadow buffer + skewed silhouettes + heightmap ray-march (High).
- L5 (sonnet + haiku tests): settings toggle, caps/LOD, perf measurement at 1080p, before/after screenshots day + night, readability check.
Order: L1 ∥ L2 -> L3 -> L4 -> L5. Each lands behind the setting (Off by default until L5 flips the default to Low).
