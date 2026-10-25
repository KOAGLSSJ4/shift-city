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
| `ferrari.glb` → `cars/rosso.glb` | three.js examples, model "Ferrari 458 Italia" by [vicent091036](https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6) | Sketchfab licence — **verify before any public/commercial release** | **Placeholder** body for the "Rosso F90" garage car |
| Draco decoder (`public/draco/`) | three.js r170 | MIT | Decoding the compressed glTF car |

## Important

- The Rosso F90 model is a recognisable real-world car design. It is used **only as a prototype placeholder**
  to prove the authored-model pipeline (glTF + Draco + PBR paint) works. It must be replaced by a licensed or
  commissioned fictional model before any public or commercial release.
- All other cars are procedural (code-generated) and fictional.
- Everything else is CC0 and can be redistributed freely.
