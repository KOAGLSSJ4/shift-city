# Third-party assets

Downloaded by `npm run fetch-assets` into `public/assets/` (not committed to git).

| Asset | Source | Licence | Used for |
|---|---|---|---|
| `kloofendal_48d_partly_cloudy_puresky` HDRI (1k + 2k) | [Poly Haven](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) — Greg Zaal, Jarod Guest | CC0 | Sky, image-based lighting, reflections, sun direction |
| `belfast_sunset_puresky` HDRI (1k + 2k) | [Poly Haven](https://polyhaven.com/a/belfast_sunset_puresky) | CC0 | Golden-hour sky + lighting |
| `kloppenheim_07_puresky` HDRI (1k + 2k) | [Poly Haven](https://polyhaven.com/a/kloppenheim_07_puresky) | CC0 | Night sky + lighting |
| `asphalt_02` (diffuse/normal/roughness, 1k) | [Poly Haven](https://polyhaven.com/a/asphalt_02) | CC0 | Photoreal roads |
| `concrete_pavers_02` | [Poly Haven](https://polyhaven.com/a/concrete_pavers_02) | CC0 | Photoreal sidewalks |
| `concrete_wall_008` | [Poly Haven](https://polyhaven.com/a/concrete_wall_008) | CC0 | Roofs, facade surface detail |
| `brick_wall_02` | [Poly Haven](https://polyhaven.com/a/brick_wall_02) | CC0 | Brick facade surface detail |
| Street props in `public/props/` — `street_lamp_01`, `fire_hydrant`, `metal_trash_can`, `modular_street_seating`, `utility_box_01`, `exterior_aircon_unit`, `water_manhole_cover`, `concrete_road_barrier` | [Poly Haven](https://polyhaven.com/models) | CC0 | Simplified (~1–5k triangles each) with glTF-Transform, 512px WebP textures, Draco geometry. Source: `scripts/fetch-polyhaven-models.mjs` |
| Tree impostors in `public/trees/` — from `tree_small_02` and `island_tree_01` | [Poly Haven](https://polyhaven.com/models) | CC0 | The full scanned trees (1.7–4.7M triangles) photographed from 3 angles by `scripts/bake-impostors.cjs` and shown on crossed cards |
| Draco decoder (`public/draco/`) | three.js r170 | MIT | Decoding the compressed glTF props |

## Important

- Every car (garage and traffic) is an original procedural design generated in code (`src/vehicles/designs.ts`);
  none is based on a real model or brand.
- Everything else is CC0 and can be redistributed freely.
