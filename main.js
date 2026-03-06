const TILE_SIZE = 32;
const MAP_WIDTH = 30;
const MAP_HEIGHT = 20;
const PLAYER_SPEED = 140;
const PLAYER_MAX_HEALTH = 5;
const PLAYER_HIT_COOLDOWN = 0.9;
const PLAYER_CONTACT_DAMAGE = 1;
const FIREBALL_SPEED = 260;
const FIREBALL_RADIUS = 4;
const FIREBALL_STEP_PX = 2;
const FIREBALL_COOLDOWN = 0.55;
const JUMP_DISTANCE = TILE_SIZE * 2;
const JUMP_COOLDOWN = 30;
const IMPACT_DURATION = 0.24;
const SKELETON_RADIUS = 10;
const SKELETON_STEP = TILE_SIZE * 0.5;
const SKELETON_DEATH_DURATION = 0.45;
const SKELETON_HIT_FLASH_DURATION = 0.15;
const SKELETON_MOVE_INTERVAL_MIN = 0.22;
const SKELETON_MOVE_INTERVAL_MAX = 0.38;
const SKELETON_AGGRO_RANGE = TILE_SIZE * 6;
const SKELETON_ALIVE_CAP = 10;
const NEST_MAX_HEALTH = 2;
const NEST_HEAL_AMOUNT = 1;
const NEST_SPAWN_INTERVAL_MIN = 2.4;
const NEST_SPAWN_INTERVAL_MAX = 3.6;

const NEST_TILES = [
  [10, 1],
  [15, 3],
  [24, 9],
  [16, 11],
  [20, 17]
];

const DEFAULT_UI_MANIFEST = {
  health: "./assets/sprites/ui-health.svg",
  fireball: "./assets/sprites/ui-fireball.svg",
  jump: "./assets/sprites/ui-jump.svg",
  nest: "./assets/sprites/ui-nest.svg",
  victory: "./assets/sprites/ui-victory.svg",
  defeat: "./assets/sprites/ui-defeat.svg"
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const healthEl = document.getElementById("health");
const fireballAbilityEl = document.getElementById("ability-fireball");
const jumpAbilityEl = document.getElementById("ability-jump");
const nestTrackEl = document.getElementById("nest-track");
const runeIndicatorEl = document.getElementById("rune-indicator");
const runeIconEl = document.getElementById("rune-icon");
const overlayEl = document.getElementById("overlay");
const overlayArtEl = document.getElementById("overlay-art");
const overlayTitleEl = document.getElementById("overlay-title");
const overlaySubtitleEl = document.getElementById("overlay-subtitle");
const restartButtonEl = document.getElementById("restart-button");

const keys = new Set();
let inputClock = 0;
const keyPressedAt = new Map();
let castQueued = false;
let jumpQueued = false;

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
  health: PLAYER_MAX_HEALTH,
  maxHealth: PLAYER_MAX_HEALTH,
  invulnerableUntil: 0
};

const fireball = {
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: FIREBALL_RADIUS,
  cooldownUntil: 0
};

const jump = {
  cooldownUntil: 0
};

const impactEffect = {
  active: false,
  x: 0,
  y: 0,
  age: 0
};

const skeletons = [];
const nests = [];
let skeletonIdCounter = 0;
let gameTime = 0;
let gameState = "playing";
let runeUnlocked = false;
let last = performance.now();
let uiManifest = { ...DEFAULT_UI_MANIFEST };
const healthPips = [];
const nestPips = [];

const overlayState = {
  visible: false
};

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();

  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) {
      castQueued = true;
    }
    return;
  }

  if (e.key === "Shift") {
    e.preventDefault();
    if (!e.repeat) {
      jumpQueued = true;
    }
    return;
  }

  if (e.key === "r" || e.key === "R") {
    if (gameState === "won" || gameState === "lost") {
      resetGame();
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
  if (e.code === "Space" || e.key === "Shift") {
    return;
  }
  const key = e.key.toLowerCase();
  keys.delete(key);
  keyPressedAt.delete(key);
});

restartButtonEl.addEventListener("click", () => {
  resetGame();
});

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function normalizeDirectionalManifest(entry, label) {
  if (typeof entry === "string") {
    return {
      up: entry,
      down: entry,
      left: entry,
      right: entry
    };
  }

  const fallback = entry?.down || entry?.up || entry?.left || entry?.right;
  if (!fallback) {
    throw new Error(`Manifest is missing ${label} sprite paths.`);
  }

  return {
    up: entry.up || fallback,
    down: entry.down || fallback,
    left: entry.left || fallback,
    right: entry.right || fallback
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

function normalizeUiManifest(entry) {
  return {
    health: entry?.health || DEFAULT_UI_MANIFEST.health,
    fireball: entry?.fireball || DEFAULT_UI_MANIFEST.fireball,
    jump: entry?.jump || DEFAULT_UI_MANIFEST.jump,
    nest: entry?.nest || DEFAULT_UI_MANIFEST.nest,
    victory: entry?.victory || DEFAULT_UI_MANIFEST.victory,
    defeat: entry?.defeat || DEFAULT_UI_MANIFEST.defeat
  };
}

async function loadSprites() {
  const manifest = await loadManifest();
  const wizardManifest = normalizeDirectionalManifest(manifest.wizard, "wizard");
  const fireballFramesManifest = normalizeAnimationManifest(manifest.fireball);
  const impactFramesManifest = normalizeAnimationManifest(manifest.fireballImpact);
  const skeletonManifest = normalizeDirectionalManifest(
    manifest.skeleton || {
      up: "./assets/sprites/skeleton-up.svg",
      down: "./assets/sprites/skeleton-down.svg",
      left: "./assets/sprites/skeleton-left.svg",
      right: "./assets/sprites/skeleton-right.svg"
    },
    "skeleton"
  );
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

  uiManifest = normalizeUiManifest(manifest.ui);

  const [
    wizardUp,
    wizardDown,
    wizardLeft,
    wizardRight,
    wall,
    floor,
    rune,
    skeletonUp,
    skeletonDown,
    skeletonLeft,
    skeletonRight,
    fireballFrames,
    impactFrames
  ] = await Promise.all([
    loadImage(wizardManifest.up),
    loadImage(wizardManifest.down),
    loadImage(wizardManifest.left),
    loadImage(wizardManifest.right),
    loadImage(manifest.wall),
    loadImage(manifest.floor),
    loadImage(manifest.objective),
    loadImage(skeletonManifest.up),
    loadImage(skeletonManifest.down),
    loadImage(skeletonManifest.left),
    loadImage(skeletonManifest.right),
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
    skeleton: {
      up: skeletonUp,
      down: skeletonDown,
      left: skeletonLeft,
      right: skeletonRight
    },
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

function livingNestsCount() {
  return nests.filter((nest) => !nest.destroyed).length;
}

function canCastFireball() {
  return gameState === "playing" && !fireball.active && gameTime >= fireball.cooldownUntil;
}

function canJump() {
  return gameState === "playing" && gameTime >= jump.cooldownUntil;
}

function fireballCooldownRemaining() {
  return Math.max(0, fireball.cooldownUntil - gameTime);
}

function jumpCooldownRemaining() {
  return Math.max(0, jump.cooldownUntil - gameTime);
}

function renderHealth() {
  if (healthPips.length !== player.maxHealth) {
    healthPips.length = 0;
    healthEl.innerHTML = "";
    for (let i = 0; i < player.maxHealth; i += 1) {
      const pip = document.createElement("img");
      pip.className = "hud-pip";
      pip.src = uiManifest.health;
      pip.alt = "";
      pip.decoding = "async";
      healthPips.push(pip);
      healthEl.appendChild(pip);
    }
  }

  healthPips.forEach((pip, index) => {
    pip.classList.toggle("is-filled", index < player.health);
    pip.classList.toggle("is-empty", index >= player.health);
  });
  healthEl.setAttribute("aria-label", `Health ${player.health} out of ${player.maxHealth}`);
}

function renderNestTrack() {
  const destroyedCount = nests.filter((nest) => nest.destroyed).length;
  if (nestPips.length !== nests.length) {
    nestPips.length = 0;
    nestTrackEl.innerHTML = "";
    for (let i = 0; i < nests.length; i += 1) {
      const marker = document.createElement("img");
      marker.className = "objective-pip";
      marker.src = uiManifest.nest;
      marker.alt = "";
      marker.decoding = "async";
      nestPips.push(marker);
      nestTrackEl.appendChild(marker);
    }
  }

  nestPips.forEach((pip, index) => {
    pip.classList.toggle("is-cleared", index < destroyedCount);
  });
  nestTrackEl.setAttribute("aria-label", `${destroyedCount} of ${nests.length} nests destroyed`);
}

function setAbilityVisual(slotEl, cooldownRemaining, cooldownDuration, activeLabel) {
  const fillEl = slotEl.querySelector(".ability-fill");
  const glowEl = slotEl.querySelector(".ability-ready");
  const ready = cooldownRemaining <= 0;
  const progress = ready ? 0 : clamp(cooldownRemaining / cooldownDuration, 0, 1);

  fillEl.style.transform = `scaleY(${progress})`;
  slotEl.classList.toggle("is-ready", ready);
  glowEl.hidden = !ready;
  slotEl.setAttribute("aria-label", ready ? `${activeLabel} ready` : `${activeLabel} cooling down`);
}

function updateHud() {
  renderHealth();
  renderNestTrack();

  const runeLocked = !runeUnlocked;
  runeIndicatorEl.classList.toggle("is-unlocked", !runeLocked);
  runeIndicatorEl.classList.toggle("is-locked", runeLocked);
  runeIndicatorEl.setAttribute("aria-label", runeLocked ? "Rune locked" : "Rune unlocked");
  runeIconEl.src = "./assets/sprites/objective.svg";

  setAbilityVisual(fireballAbilityEl, fireballCooldownRemaining(), FIREBALL_COOLDOWN, "Fireball");
  setAbilityVisual(jumpAbilityEl, jumpCooldownRemaining(), JUMP_COOLDOWN, "Jump");
}

function showOverlay(kind) {
  overlayState.visible = true;
  overlayEl.hidden = false;
  overlayEl.dataset.state = kind;

  if (kind === "won") {
    overlayArtEl.src = uiManifest.victory;
    overlayTitleEl.textContent = "Dungeon Cleared";
    overlaySubtitleEl.textContent = "The rune is yours. Press R or restart to run it again.";
  } else {
    overlayArtEl.src = uiManifest.defeat;
    overlayTitleEl.textContent = "The Wizard Fell";
    overlaySubtitleEl.textContent = "Recover your footing. Press R or restart to try again.";
  }
}

function hideOverlay() {
  overlayState.visible = false;
  overlayEl.hidden = true;
  overlayEl.dataset.state = "";
}

function spawnFireball() {
  const [dx, dy] = directionFromFacing(player.facing);
  if (!dx && !dy) return false;
  fireball.active = true;
  fireball.x = player.x;
  fireball.y = player.y;
  fireball.vx = dx;
  fireball.vy = dy;
  fireball.cooldownUntil = gameTime + FIREBALL_COOLDOWN;
  return true;
}

function killPlayer(reason = "combat") {
  if (gameState !== "playing") return;
  gameState = "lost";
  fireball.active = false;
  if (reason === "jump-wall") {
    triggerImpact(player.x, player.y);
  }
  showOverlay("lost");
}

function attemptJump() {
  const [dx, dy] = directionFromFacing(player.facing);
  if (!dx && !dy) return false;

  jump.cooldownUntil = gameTime + JUMP_COOLDOWN;
  const nx = player.x + dx * JUMP_DISTANCE;
  const ny = player.y + dy * JUMP_DISTANCE;

  player.x = nx;
  player.y = ny;
  if (!canMoveTo(player.x, player.y)) {
    killPlayer("jump-wall");
    return true;
  }

  triggerImpact(player.x, player.y);
  return true;
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

function findOpenSpawnPosition(cx, cy, radius, ignoreId = null) {
  const offsets = [
    [0, 0],
    [TILE_SIZE * 0.5, 0],
    [-TILE_SIZE * 0.5, 0],
    [0, TILE_SIZE * 0.5],
    [0, -TILE_SIZE * 0.5],
    [TILE_SIZE * 0.5, TILE_SIZE * 0.5],
    [-TILE_SIZE * 0.5, TILE_SIZE * 0.5],
    [TILE_SIZE * 0.5, -TILE_SIZE * 0.5],
    [-TILE_SIZE * 0.5, -TILE_SIZE * 0.5]
  ];

  for (const [ox, oy] of offsets) {
    const x = cx + ox;
    const y = cy + oy;
    if (!canCircleMoveTo(x, y, radius)) continue;
    if (overlapsAnyAliveSkeleton(x, y, radius, ignoreId)) continue;
    if (Math.hypot(x - player.x, y - player.y) < TILE_SIZE * 1.1) continue;
    return { x, y };
  }

  return null;
}

function initializeNests() {
  const runePosition = findTilePosition("R");

  for (const [tx, ty] of NEST_TILES) {
    const x = (tx + 0.5) * TILE_SIZE;
    const y = (ty + 0.5) * TILE_SIZE;
    if (tileAtPixel(x, y) === "#") continue;
    if (!canCircleMoveTo(x, y, TILE_SIZE * 0.3)) continue;
    if (Math.hypot(x - player.x, y - player.y) < TILE_SIZE * 5) continue;
    if (runePosition && Math.hypot(x - runePosition.x, y - runePosition.y) < TILE_SIZE * 3) continue;

    nests.push({
      x,
      y,
      radius: 12,
      health: NEST_MAX_HEALTH,
      destroyed: false,
      nextSpawnAt: randomInRange(0.8, 1.8)
    });
  }
}

function spawnSkeletonAt(x, y) {
  const spawnPosition = findOpenSpawnPosition(x, y, SKELETON_RADIUS);
  if (!spawnPosition) return false;

  skeletons.push({
    id: ++skeletonIdCounter,
    x: spawnPosition.x,
    y: spawnPosition.y,
    radius: SKELETON_RADIUS,
    facing: "down",
    state: "alive",
    nextMoveAt: gameTime + randomInRange(0.08, 0.22),
    deathAge: 0,
    hitDx: 0,
    hitDy: 0
  });
  return true;
}

function initializeSkeletons() {
  for (const nest of nests) {
    spawnSkeletonAt(nest.x, nest.y);
  }
}

function unlockRuneIfCleared() {
  if (runeUnlocked || livingNestsCount() > 0) return;
  runeUnlocked = true;
}

function killSkeleton(skeleton, hitX, hitY, hitDx, hitDy) {
  if (skeleton.state !== "alive") return;
  skeleton.state = "dying";
  skeleton.deathAge = 0;
  skeleton.hitDx = hitDx;
  skeleton.hitDy = hitDy;
  triggerImpact(hitX, hitY);
}

function resetAbilityCooldowns() {
  fireball.cooldownUntil = gameTime;
  jump.cooldownUntil = gameTime;
}

function destroyNest(nest, hitX, hitY) {
  nest.destroyed = true;
  nest.health = 0;
  triggerImpact(hitX, hitY);
  player.health = clamp(player.health + NEST_HEAL_AMOUNT, 0, player.maxHealth);
  resetAbilityCooldowns();
  unlockRuneIfCleared();
}

function damageNest(nest, hitX, hitY) {
  if (nest.destroyed) return;
  nest.health -= 1;
  triggerImpact(hitX, hitY);
  if (nest.health <= 0) {
    destroyNest(nest, hitX, hitY);
  }
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

    const hitNest = nests.find((nest) => {
      if (nest.destroyed) return false;
      const minDistance = fireball.radius + nest.radius;
      return Math.hypot(nx - nest.x, ny - nest.y) < minDistance;
    });

    if (hitNest) {
      damageNest(hitNest, nx, ny);
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

function chooseSkeletonDirection(skeleton) {
  const dx = player.x - skeleton.x;
  const dy = player.y - skeleton.y;
  const dist = Math.hypot(dx, dy);
  const directions = [];

  if (dist <= SKELETON_AGGRO_RANGE || Math.random() < 0.75) {
    if (Math.abs(dx) > Math.abs(dy)) {
      directions.push(
        { dx: Math.sign(dx), dy: 0, facing: dx < 0 ? "left" : "right" },
        { dx: 0, dy: Math.sign(dy), facing: dy < 0 ? "up" : "down" }
      );
    } else {
      directions.push(
        { dx: 0, dy: Math.sign(dy), facing: dy < 0 ? "up" : "down" },
        { dx: Math.sign(dx), dy: 0, facing: dx < 0 ? "left" : "right" }
      );
    }
  }

  const randomDirections = [
    { dx: 0, dy: -1, facing: "up" },
    { dx: 0, dy: 1, facing: "down" },
    { dx: -1, dy: 0, facing: "left" },
    { dx: 1, dy: 0, facing: "right" }
  ];

  for (let i = randomDirections.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [randomDirections[i], randomDirections[j]] = [randomDirections[j], randomDirections[i]];
  }

  directions.push(...randomDirections);
  return directions;
}

function damagePlayer() {
  if (gameTime < player.invulnerableUntil || gameState !== "playing") return;
  player.health = clamp(player.health - PLAYER_CONTACT_DAMAGE, 0, player.maxHealth);
  player.invulnerableUntil = gameTime + PLAYER_HIT_COOLDOWN;

  if (player.health <= 0) {
    killPlayer("combat");
  }
}

function updateSkeletons(dt) {
  for (const skeleton of skeletons) {
    if (skeleton.state === "dead") continue;

    if (skeleton.state === "dying") {
      skeleton.deathAge += dt;
      if (skeleton.deathAge >= SKELETON_DEATH_DURATION) {
        skeleton.state = "dead";
      }
      continue;
    }

    if (gameTime >= skeleton.nextMoveAt) {
      const directions = chooseSkeletonDirection(skeleton);
      for (const direction of directions) {
        if (!direction.dx && !direction.dy) continue;
        const nx = skeleton.x + direction.dx * SKELETON_STEP;
        const ny = skeleton.y + direction.dy * SKELETON_STEP;
        const canMove =
          canCircleMoveTo(nx, ny, skeleton.radius) &&
          !overlapsAnyAliveSkeleton(nx, ny, skeleton.radius, skeleton.id);
        if (!canMove) continue;
        skeleton.x = nx;
        skeleton.y = ny;
        skeleton.facing = direction.facing;
        break;
      }
      skeleton.nextMoveAt = gameTime + randomInRange(SKELETON_MOVE_INTERVAL_MIN, SKELETON_MOVE_INTERVAL_MAX);
    }

    const minDistance = skeleton.radius + player.radius;
    if (Math.hypot(skeleton.x - player.x, skeleton.y - player.y) < minDistance) {
      damagePlayer();
    }
  }
}

function updateNests() {
  if (aliveSkeletonsCount() >= SKELETON_ALIVE_CAP) return;

  for (const nest of nests) {
    if (nest.destroyed) continue;
    if (aliveSkeletonsCount() >= SKELETON_ALIVE_CAP) return;
    if (gameTime < nest.nextSpawnAt) continue;

    spawnSkeletonAt(nest.x, nest.y);
    nest.nextSpawnAt = gameTime + randomInRange(NEST_SPAWN_INTERVAL_MIN, NEST_SPAWN_INTERVAL_MAX);
  }
}

function handleRuneState() {
  const tile = tileAtPixel(player.x, player.y);
  if (tile !== "R") return;
  if (!runeUnlocked) return;

  gameState = "won";
  fireball.active = false;
  showOverlay("won");
}

function initializeGameState() {
  player.x = TILE_SIZE * 1.5;
  player.y = TILE_SIZE * 1.5;
  player.facing = "down";
  player.health = PLAYER_MAX_HEALTH;
  player.maxHealth = PLAYER_MAX_HEALTH;
  player.invulnerableUntil = 0;

  fireball.active = false;
  fireball.x = 0;
  fireball.y = 0;
  fireball.vx = 0;
  fireball.vy = 0;
  fireball.cooldownUntil = 0;

  jump.cooldownUntil = 0;

  impactEffect.active = false;
  impactEffect.x = 0;
  impactEffect.y = 0;
  impactEffect.age = 0;

  skeletons.length = 0;
  nests.length = 0;
  skeletonIdCounter = 0;
  gameTime = 0;
  gameState = "playing";
  runeUnlocked = false;

  initializeNests();
  initializeSkeletons();
  hideOverlay();
  updateHud();
}

function resetGame() {
  keys.clear();
  keyPressedAt.clear();
  castQueued = false;
  jumpQueued = false;
  inputClock = 0;
  last = performance.now();
  initializeGameState();
}

function update(dt) {
  if (gameState !== "playing") {
    updateHud();
    return;
  }

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

  if (jumpQueued && canJump()) {
    attemptJump();
  } else if (castQueued && canCastFireball()) {
    spawnFireball();
  }
  castQueued = false;
  jumpQueued = false;

  if (gameState !== "playing") {
    updateHud();
    return;
  }

  updateNests();
  updateSkeletons(dt);
  updateFireball(dt);
  updateImpact(dt);
  unlockRuneIfCleared();
  handleRuneState();
  updateHud();
}

function drawNest(nest, camX, camY) {
  const drawX = Math.round(nest.x - TILE_SIZE / 2 - camX);
  const drawY = Math.round(nest.y - TILE_SIZE / 2 - camY);
  const pulse = 0.78 + Math.sin(performance.now() / 180) * 0.08;

  ctx.save();
  ctx.translate(drawX + TILE_SIZE / 2, drawY + TILE_SIZE / 2);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = nest.destroyed ? "rgba(90, 100, 110, 0.35)" : "rgba(207, 228, 235, 0.9)";
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = nest.destroyed ? "rgba(45, 52, 57, 0.7)" : "rgba(116, 56, 38, 0.95)";
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = nest.destroyed ? "rgba(120, 120, 120, 0.5)" : "rgba(255, 240, 220, 0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, -6);
  ctx.lineTo(5, -1);
  ctx.lineTo(-3, 6);
  ctx.stroke();
  ctx.restore();
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
          if (runeUnlocked) {
            ctx.drawImage(sprites.rune, sx, sy, TILE_SIZE, TILE_SIZE);
          } else {
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.drawImage(sprites.rune, sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = "rgba(18, 43, 54, 0.55)";
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.restore();
          }
        }
      }
    }
  }

  for (const nest of nests) {
    drawNest(nest, camX, camY);
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
    ctx.drawImage(sprites.skeleton[skeleton.facing], -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);

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

  ctx.save();
  if (gameTime < player.invulnerableUntil && Math.floor(performance.now() / 90) % 2 === 0) {
    ctx.globalAlpha = 0.55;
  }
  ctx.drawImage(
    sprites.wizard[player.facing],
    Math.round(player.x - TILE_SIZE / 2 - camX),
    Math.round(player.y - TILE_SIZE / 2 - camY),
    TILE_SIZE,
    TILE_SIZE
  );
  ctx.restore();
}

function hydrateHudAssets() {
  document.querySelector('[data-ability="fireball"] .ability-icon').src = uiManifest.fireball;
  document.querySelector('[data-ability="jump"] .ability-icon').src = uiManifest.jump;
  runeIconEl.src = "./assets/sprites/objective.svg";
}

async function start() {
  try {
    const sprites = await loadSprites();
    hydrateHudAssets();
    initializeGameState();

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      update(dt);
      drawWorld(sprites);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  } catch (error) {
    overlayEl.hidden = false;
    overlayTitleEl.textContent = "Load Error";
    overlaySubtitleEl.textContent = error.message;
    restartButtonEl.hidden = true;
    console.error(error);
  }
}

start();
