const TILE_SIZE = 32;
const MAP_WIDTH = 30;
const MAP_HEIGHT = 20;
const PLAYER_SPEED = 140;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const statusEl = document.getElementById("status");

const keys = new Set();
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (["w", "a", "s", "d"].includes(key)) {
    e.preventDefault();
    keys.add(key);
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

const map = [
  "##############################",
  "#............##..............#",
  "#.######.###.##.###########..#",
  "#.#....#...#....#.........#..#",
  "#.#.##.###.######.#######.#..#",
  "#...##...#......#.#.....#.#..#",
  "###.####.######.#.#.###.#.#..#",
  "#...#..#....#...#.#.#...#.#..#",
  "#.###..####.#.###.#.#.###.#..#",
  "#...#.....#.#.....#.#.....#..#",
  "###.#####.#.#######.#######..#",
  "#...#...#.#.......#.......#..#",
  "#.###.#.#.#######.#######.#..#",
  "#.....#.#...#...#.......#.#..#",
  "#######.###.#.#.#######.#.#..#",
  "#.......#...#.#.......#.#.#..#",
  "#.#######.###.#######.#.#.#..#",
  "#.........#...........#...#..#",
  "#....R....##############.....#",
  "##############################"
].map((row) => row.split(""));

const worldWidth = MAP_WIDTH * TILE_SIZE;
const worldHeight = MAP_HEIGHT * TILE_SIZE;

const player = {
  x: TILE_SIZE * 1.5,
  y: TILE_SIZE * 1.5,
  radius: 10,
  won: false
};

function tileAtPixel(px, py) {
  const tx = Math.floor(px / TILE_SIZE);
  const ty = Math.floor(py / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) {
    return "#";
  }
  return map[ty][tx];
}

function isBlocked(px, py) {
  return tileAtPixel(px, py) === "#";
}

function canMoveTo(nx, ny) {
  const r = player.radius;
  return (
    !isBlocked(nx - r, ny - r) &&
    !isBlocked(nx + r, ny - r) &&
    !isBlocked(nx - r, ny + r) &&
    !isBlocked(nx + r, ny + r)
  );
}

async function loadManifest() {
  const response = await fetch("./assets/sprites/manifest.json", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error("Missing assets/sprites/manifest.json. Run: npm run generate:assets");
  }
  return response.json();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

async function loadSprites() {
  const manifest = await loadManifest();
  const [wizard, wall, floor, rune] = await Promise.all([
    loadImage(manifest.wizard),
    loadImage(manifest.wall),
    loadImage(manifest.floor),
    loadImage(manifest.objective)
  ]);
  return { wizard, wall, floor, rune };
}

function normalize(vx, vy) {
  const len = Math.hypot(vx, vy);
  if (!len) return [0, 0];
  return [vx / len, vy / len];
}

function update(dt) {
  if (player.won) return;

  let mx = 0;
  let my = 0;
  if (keys.has("w")) my -= 1;
  if (keys.has("s")) my += 1;
  if (keys.has("a")) mx -= 1;
  if (keys.has("d")) mx += 1;

  const [dx, dy] = normalize(mx, my);
  const step = PLAYER_SPEED * dt;

  const nx = player.x + dx * step;
  const ny = player.y + dy * step;

  if (canMoveTo(nx, player.y)) player.x = nx;
  if (canMoveTo(player.x, ny)) player.y = ny;

  const tile = tileAtPixel(player.x, player.y);
  if (tile === "R") {
    player.won = true;
    statusEl.textContent = "Rune recovered. Dungeon cleared.";
  }
}

function drawWorld(sprites) {
  const camX = Math.max(0, Math.min(player.x - canvas.width / 2, worldWidth - canvas.width));
  const camY = Math.max(0, Math.min(player.y - canvas.height / 2, worldHeight - canvas.height));

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const ch = map[y][x];
      const sx = x * TILE_SIZE - camX;
      const sy = y * TILE_SIZE - camY;
      if (sx + TILE_SIZE < 0 || sy + TILE_SIZE < 0 || sx > canvas.width || sy > canvas.height) continue;

      if (ch === "#") {
        ctx.drawImage(sprites.wall, sx, sy, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.drawImage(sprites.floor, sx, sy, TILE_SIZE, TILE_SIZE);
        if (ch === "R") {
          ctx.drawImage(sprites.rune, sx, sy, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  ctx.drawImage(
    sprites.wizard,
    Math.round(player.x - TILE_SIZE / 2 - camX),
    Math.round(player.y - TILE_SIZE / 2 - camY),
    TILE_SIZE,
    TILE_SIZE
  );
}

let last = performance.now();

async function start() {
  try {
    const sprites = await loadSprites();
    statusEl.textContent = "Find the glowing rune.";

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      update(dt);
      drawWorld(sprites);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  } catch (error) {
    statusEl.textContent = error.message;
    console.error(error);
  }
}

start();
