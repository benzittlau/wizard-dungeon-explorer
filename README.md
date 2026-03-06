# Wizard Dungeon Explorer

Basic browser dungeon game with `W/A/S/D` movement.

## Run the game

```bash
npm run serve
```

Then open `http://localhost:8080`.

## PixelLab sprite generation

The script is ready and capped at 10 calls:

```bash
npm run generate:assets
```

It reads `PIXELLAB_API_KEY` from `.env` and writes generated PNG sprites to `assets/sprites/` plus `assets/sprites/manifest.json`.

Current repo includes local fallback SVG sprites so the game runs even when API credits are unavailable.
