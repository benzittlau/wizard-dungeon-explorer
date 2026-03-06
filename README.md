# Wizard Dungeon Explorer

Wizard Dungeon Explorer is a small browser action game built with plain HTML, CSS, and JavaScript.  
You explore a tile-based dungeon, fight skeletons, destroy spawning nests, unlock the rune, and escape.

## Gameplay Overview

- Move through a 30x20 dungeon map with wall collision and camera tracking.
- Cast fireballs to damage skeletons and break enemy nests.
- Use a directional jump/dash ability for repositioning (unsafe jumps into walls can kill you).
- Survive contact damage from enemies and manage limited health.
- Destroy all nests to unlock the rune tile, then reach it to win.

## Controls

- `W A S D`: Move
- `Space`: Cast fireball
- `Shift`: Jump/Dash in the current facing direction
- `R`: Restart after win/loss

## Run Locally

```bash
npm run serve
```

Open `http://localhost:8080` in your browser.

## Project Structure

- `index.html`: UI shell, HUD, and page styling.
- `main.js`: Core game loop, input handling, combat, AI, rendering, and game state.
- `assets/sprites/manifest.json`: Sprite manifest used at runtime.
- `assets/sprites/`: Game sprite assets (wizard, skeletons, VFX, UI icons, tiles).
