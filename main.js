const TILE_SIZE = 32;
const MAP_WIDTH = 30;
const MAP_HEIGHT = 20;
const PLAYER_SPEED = 140;
const FIREBALL_SPEED = 260;
const FIREBALL_RADIUS = 4;
const FIREBALL_STEP_PX = 2;
const IMPACT_DURATION = 0.24;
const SKELETON_RADIUS = 10;
const SKELETON_MOVE_INTERVAL_MIN = 0.9;
const SKELETON_MOVE_INTERVAL_MAX = 1.2;
const SKELETON_STEP = TILE_SIZE * 0.5;
const SKELETON_DEATH_DURATION = 0.45;
const SKELETON_HIT_FLASH_DURATION = 0.15;

const SKELETON_SPAWN_TILES = [
  [6, 2],
  [25, 2],
  [4, 9],
  [18, 7],
  [26, 12],
  [8, 16],
  [20, 17],
  [27, 18]
];

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const statusEl = document.getElementById("status");

const keys = new Set();
let inputClock = 0;
const keyPressedAt = new Map();
let castQueued = false;

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) {
      castQueued = true;
    }
    return;
  }
  if (["w", "a", "s", "d"].includes(key)) {
    e.preventDefault();
    if (!keys.has(key)) {
      keyPressedAt.set(key, ++inputClock);
    }
    keys.add(key);
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    return;
  }
  const key = e.key.toLowerCase();
  keys.delete(key);
  keyPressedAt.delete(key);
});

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
  facing: "down",
  won: false
};

const fireball = {
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: FIREBALL_RADIUS
};

const impactEffect = {
  active: false,
  x: 0,
  y: 0,
  age: 0
};

const skeletons = [];
let skeletonIdCounter = 0;
let gameTime = 0;

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

function canCircleMoveTo(nx, ny, r) {
  return (
    !isBlocked(nx - r, ny - r) &&
    !isBlocked(nx + r, ny - r) &&
    !isBlocked(nx - r, ny + r) &&
    !isBlocked(nx + r, ny + r)
  );
}

function findTilePosition(tileChar) {
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (map[y][x] === tileChar) {
        return {
          x: (x + 0.5) * TILE_SIZE,
          y: (y + 0.5) * TILE_SIZE
        };
      }
    }
  }
  return null;
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
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

function normalizeWizardManifest(wizardManifest) {
  if (typeof wizardManifest === "string") {
    return {
      up: wizardManifest,
      down: wizardManifest,
      left: wizardManifest,
      right: wizardManifest
    };
  }

  const fallback =
    wizardManifest?.down || wizardManifest?.up || wizardManifest?.left || wizardManifest?.right;
  if (!fallback) {
    throw new Error("Manifest is missing wizard sprite paths.");
  }

  return {
    up: wizardManifest.up || fallback,
    down: wizardManifest.down || fallback,
    left: wizardManifest.left || fallback,
    right: wizardManifest.right || fallback
  };
}

function normalizeAnimationManifest(entry) {
  if (typeof entry === "string") {
    return [entry];
  }
  if (Array.isArray(entry)) {
    return entry.filter((item) => typeof item === "string" && item.length > 0);
  }
  if (entry && typeof entry === "object") {
    if (Array.isArray(entry.frames)) {
      return entry.frames.filter((item) => typeof item === "string" && item.length > 0);
    }
    if (typeof entry.sprite === "string") {
      return [entry.sprite];
    }
  }
  return [];
}

async function loadSprites() {
  const manifest = await loadManifest();
  const wizardManifest = normalizeWizardManifest(manifest.wizard);
  const fireballFramesManifest = normalizeAnimationManifest(manifest.fireball);
  const impactFramesManifest = normalizeAnimationManifest(manifest.fireballImpact);
  const skeletonSpritePath =
    typeof manifest.skeleton === "string" && manifest.skeleton.length > 0
      ? manifest.skeleton
      : "./assets/sprites/skeleton.svg";
  const fireballFramePaths =
    fireballFramesManifest.length > 0
      ? fireballFramesManifest
      : [
          "./assets/sprites/fireball-1.svg",
          "./assets/sprites/fireball-2.svg",
          "./assets/sprites/fireball-3.svg"
        ];
  const impactFramePaths =
    impactFramesManifest.length > 0
      ? impactFramesManifest
      : [
          "./assets/sprites/fireball-impact-1.svg",
          "./assets/sprites/fireball-impact-2.svg",
          "./assets/sprites/fireball-impact-3.svg"
        ];

  const [wizardUp, wizardDown, wizardLeft, wizardRight, wall, floor, rune, skeleton, fireballFrames, impactFrames] =
    await Promise.all([
    loadImage(wizardManifest.up),
    loadImage(wizardManifest.down),
    loadImage(wizardManifest.left),
    loadImage(wizardManifest.right),
    loadImage(manifest.wall),
    loadImage(manifest.floor),
    loadImage(manifest.objective),
    loadImage(skeletonSpritePath),
    Promise.all(fireballFramePaths.map((src) => loadImage(src))),
    Promise.all(impactFramePaths.map((src) => loadImage(src)))
  ]);

  return {
    wizard: {
      up: wizardUp,
      down: wizardDown,
      left: wizardLeft,
      right: wizardRight
    },
    wall,
    floor,
    rune,
    skeleton,
    fireballFrames,
    impactFrames
  };
}

function normalize(vx, vy) {
  const len = Math.hypot(vx, vy);
  if (!len) return [0, 0];
  return [vx / len, vy / len];
}

function currentFacing() {
  let newestKey = null;
  let newestTime = -1;

  for (const key of keys) {
    const pressedAt = keyPressedAt.get(key) || 0;
    if (pressedAt > newestTime) {
      newestKey = key;
      newestTime = pressedAt;
    }
  }

  switch (newestKey) {
    case "w":
      return "up";
    case "s":
      return "down";
    case "a":
      return "left";
    case "d":
      return "right";
    default:
      return null;
  }
}

function facingFromMovement(dx, dy) {
  const horizontal = dx === 0 ? null : dx < 0 ? "left" : "right";
  const vertical = dy === 0 ? null : dy < 0 ? "up" : "down";

  if (horizontal && vertical) {
    const horizontalTime = Math.max(keyPressedAt.get("a") || 0, keyPressedAt.get("d") || 0);
    const verticalTime = Math.max(keyPressedAt.get("w") || 0, keyPressedAt.get("s") || 0);
    return horizontalTime > verticalTime ? horizontal : vertical;
  }

  return horizontal || vertical;
}

function directionFromFacing(facing) {
  switch (facing) {
    case "up":
      return [0, -1];
    case "down":
      return [0, 1];
    case "left":
      return [-1, 0];
    case "right":
      return [1, 0];
    default:
      return [0, 0];
  }
}

function triggerImpact(x, y) {
  impactEffect.active = true;
  impactEffect.x = x;
  impactEffect.y = y;
  impactEffect.age = 0;
}

function spawnFireball() {
  const [dx, dy] = directionFromFacing(player.facing);
  if (!dx && !dy) return;
  fireball.active = true;
  fireball.x = player.x;
  fireball.y = player.y;
  fireball.vx = dx;
  fireball.vy = dy;
}

function aliveSkeletonsCount() {
  return skeletons.filter((skeleton) => skeleton.state === "alive").length;
}

function overlapsAnyAliveSkeleton(nx, ny, radius, ignoreId = null) {
  return skeletons.some((skeleton) => {
    if (skeleton.state !== "alive") return false;
    if (ignoreId !== null && skeleton.id === ignoreId) return false;
    const minDistance = radius + skeleton.radius;
    return Math.hypot(nx - skeleton.x, ny - skeleton.y) < minDistance;
  });
}

function initializeSkeletons() {
  const runePosition = findTilePosition("R");

  for (const [tx, ty] of SKELETON_SPAWN_TILES) {
    const x = (tx + 0.5) * TILE_SIZE;
    const y = (ty + 0.5) * TILE_SIZE;

    if (tileAtPixel(x, y) === "#") continue;
    if (!canCircleMoveTo(x, y, SKELETON_RADIUS)) continue;
    if (Math.hypot(x - player.x, y - player.y) < TILE_SIZE * 4) continue;
    if (runePosition && Math.hypot(x - runePosition.x, y - runePosition.y) < TILE_SIZE * 3) continue;
    if (overlapsAnyAliveSkeleton(x, y, SKELETON_RADIUS)) continue;

    skeletons.push({
      id: ++skeletonIdCounter,
      x,
      y,
      radius: SKELETON_RADIUS,
      facing: "down",
      state: "alive",
      nextMoveAt: randomInRange(SKELETON_MOVE_INTERVAL_MIN, SKELETON_MOVE_INTERVAL_MAX),
      deathAge: 0,
      hitDx: 0,
      hitDy: 0
    });
  }
}

function setSkeletonKilledStatus() {
  if (player.won) return;
  statusEl.textContent = `Skeleton destroyed (${aliveSkeletonsCount()} remaining).`;
}

function killSkeleton(skeleton, hitX, hitY, hitDx, hitDy) {
  if (skeleton.state !== "alive") return;
  skeleton.state = "dying";
  skeleton.deathAge = 0;
  skeleton.hitDx = hitDx;
  skeleton.hitDy = hitDy;
  triggerImpact(hitX, hitY);
  setSkeletonKilledStatus();
}

function updateFireball(dt) {
  if (!fireball.active) return;

  const distance = FIREBALL_SPEED * dt;
  const steps = Math.max(1, Math.ceil(distance / FIREBALL_STEP_PX));
  const stepSize = distance / steps;

  for (let i = 0; i < steps; i += 1) {
    const nx = fireball.x + fireball.vx * stepSize;
    const ny = fireball.y + fireball.vy * stepSize;

    if (!canCircleMoveTo(nx, ny, fireball.radius)) {
      triggerImpact(nx, ny);
      fireball.active = false;
      return;
    }

    const hitSkeleton = skeletons.find((skeleton) => {
      if (skeleton.state !== "alive") return false;
      const minDistance = fireball.radius + skeleton.radius;
      return Math.hypot(nx - skeleton.x, ny - skeleton.y) < minDistance;
    });

    if (hitSkeleton) {
      killSkeleton(hitSkeleton, nx, ny, fireball.vx, fireball.vy);
      fireball.active = false;
      return;
    }

    fireball.x = nx;
    fireball.y = ny;
  }
}

function updateImpact(dt) {
  if (!impactEffect.active) return;
  impactEffect.age += dt;
  if (impactEffect.age >= IMPACT_DURATION) {
    impactEffect.active = false;
  }
}

function updateSkeletons(dt) {
  const directions = [
    { dx: 0, dy: -1, facing: "up" },
    { dx: 0, dy: 1, facing: "down" },
    { dx: -1, dy: 0, facing: "left" },
    { dx: 1, dy: 0, facing: "right" }
  ];

  for (const skeleton of skeletons) {
    if (skeleton.state === "dead") continue;

    if (skeleton.state === "dying") {
      skeleton.deathAge += dt;
      if (skeleton.deathAge >= SKELETON_DEATH_DURATION) {
        skeleton.state = "dead";
      }
      continue;
    }

    if (gameTime < skeleton.nextMoveAt) continue;

    const direction = directions[Math.floor(Math.random() * directions.length)];
    skeleton.facing = direction.facing;

    const nx = skeleton.x + direction.dx * SKELETON_STEP;
    const ny = skeleton.y + direction.dy * SKELETON_STEP;

    const canMove =
      canCircleMoveTo(nx, ny, skeleton.radius) &&
      !overlapsAnyAliveSkeleton(nx, ny, skeleton.radius, skeleton.id);
    if (canMove) {
      skeleton.x = nx;
      skeleton.y = ny;
    }

    skeleton.nextMoveAt = gameTime + randomInRange(SKELETON_MOVE_INTERVAL_MIN, SKELETON_MOVE_INTERVAL_MAX);
  }
}

function update(dt) {
  if (player.won) return;
  gameTime += dt;

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

  const prevX = player.x;
  const prevY = player.y;

  if (canMoveTo(nx, player.y)) player.x = nx;
  if (canMoveTo(player.x, ny)) player.y = ny;

  const facing = facingFromMovement(player.x - prevX, player.y - prevY) || currentFacing();
  if (facing) {
    player.facing = facing;
  }

  if (castQueued && !fireball.active) {
    spawnFireball();
  }
  castQueued = false;

  updateSkeletons(dt);
  updateFireball(dt);
  updateImpact(dt);

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

  for (const skeleton of skeletons) {
    if (skeleton.state === "dead") continue;

    let alpha = 1;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;

    if (skeleton.state === "dying") {
      const progress = Math.min(1, skeleton.deathAge / SKELETON_DEATH_DURATION);
      alpha = 1 - progress;
      scale = 1 - 0.18 * progress;
      const push = Math.max(0, 1 - skeleton.deathAge / SKELETON_HIT_FLASH_DURATION) * 3;
      offsetX = skeleton.hitDx * push;
      offsetY = skeleton.hitDy * push;
    }

    const drawX = Math.round(skeleton.x - TILE_SIZE / 2 + offsetX - camX);
    const drawY = Math.round(skeleton.y - TILE_SIZE / 2 + offsetY - camY);
    const centerX = drawX + TILE_SIZE / 2;
    const centerY = drawY + TILE_SIZE / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.drawImage(sprites.skeleton, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);

    if (skeleton.state === "dying" && skeleton.deathAge < SKELETON_HIT_FLASH_DURATION) {
      const flashStrength = 1 - skeleton.deathAge / SKELETON_HIT_FLASH_DURATION;
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = `rgba(255, 245, 215, ${0.7 * flashStrength})`;
      ctx.fillRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    }

    ctx.restore();
  }

  if (impactEffect.active && sprites.impactFrames.length > 0) {
    const frameIndex = Math.min(
      sprites.impactFrames.length - 1,
      Math.floor((impactEffect.age / IMPACT_DURATION) * sprites.impactFrames.length)
    );
    const impactSprite = sprites.impactFrames[frameIndex];
    ctx.drawImage(
      impactSprite,
      Math.round(impactEffect.x - TILE_SIZE / 2 - camX),
      Math.round(impactEffect.y - TILE_SIZE / 2 - camY),
      TILE_SIZE,
      TILE_SIZE
    );
  }

  if (fireball.active && sprites.fireballFrames.length > 0) {
    const pulseFrame = Math.floor(performance.now() / 70) % sprites.fireballFrames.length;
    const fireballSprite = sprites.fireballFrames[pulseFrame];
    ctx.drawImage(
      fireballSprite,
      Math.round(fireball.x - TILE_SIZE / 2 - camX),
      Math.round(fireball.y - TILE_SIZE / 2 - camY),
      TILE_SIZE,
      TILE_SIZE
    );
  }

  ctx.drawImage(
    sprites.wizard[player.facing],
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
    initializeSkeletons();
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
