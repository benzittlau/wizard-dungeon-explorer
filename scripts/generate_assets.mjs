import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env");
const ASSET_DIR = path.join(ROOT, "assets", "sprites");
const MANIFEST_PATH = path.join(ASSET_DIR, "manifest.json");
const API_BASE = "https://api.pixellab.ai/v2";
const MAX_CALLS = 10;

let callCount = 0;

function parseDotEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

async function loadApiKey() {
  const envRaw = await fs.readFile(ENV_PATH, "utf8");
  const env = parseDotEnv(envRaw);
  const key = env.PIXELLAB_API_KEY;
  if (!key) {
    throw new Error("Missing PIXELLAB_API_KEY in .env");
  }
  return key;
}

function pickBase64(payload) {
  const candidates = [
    payload?.data?.images?.[0]?.base64,
    payload?.data?.images?.[0]?.image?.base64,
    payload?.data?.image?.base64,
    payload?.data?.base64,
    payload?.images?.[0]?.base64
  ];
  const found = candidates.find((v) => typeof v === "string" && v.length > 0);
  if (!found) {
    const topKeys = Object.keys(payload || {});
    throw new Error(`Could not find base64 image in response. Top-level keys: ${topKeys.join(", ")}`);
  }
  return found;
}

async function generateImage({ apiKey, description, outputName }) {
  if (callCount >= MAX_CALLS) {
    throw new Error(`Call budget exceeded (${MAX_CALLS})`);
  }

  callCount += 1;

  console.log(`Requesting ${outputName}...`);

  const response = await fetch(`${API_BASE}/generate-image-v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      description,
      image_size: { width: 32, height: 32 },
      no_background: true,
      seed: 42
    })
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from PixelLab (${response.status}): ${text.slice(0, 300)}`);
  }

  if (!response.ok || payload.success === false) {
    const message = payload?.error?.message || payload?.error || JSON.stringify(payload).slice(0, 300);
    throw new Error(`PixelLab request failed (${response.status}) for ${outputName}: ${message}`);
  }

  const base64 = pickBase64(payload);
  const outPath = path.join(ASSET_DIR, `${outputName}.png`);
  await fs.writeFile(outPath, Buffer.from(base64, "base64"));
  return `./assets/sprites/${outputName}.png`;
}

async function main() {
  await fs.mkdir(ASSET_DIR, { recursive: true });
  const apiKey = await loadApiKey();

  const spriteRequests = [
    {
      id: "wizard",
      description:
        "top-down pixel art wizard hero, blue robe, silver staff, readable silhouette, 32x32, transparent background"
    },
    {
      id: "wall",
      description:
        "top-down dungeon stone wall tile, seamless edges, dark gray bricks, 32x32, transparent background"
    },
    {
      id: "floor",
      description:
        "top-down dungeon floor tile, worn cobblestone, subtle variation, seamless, 32x32, transparent background"
    },
    {
      id: "objective",
      description:
        "top-down glowing arcane rune tile icon, cyan magic glyph, readable and centered, 32x32, transparent background"
    }
  ];

  const manifest = {};

  for (const request of spriteRequests) {
    const relativePath = await generateImage({
      apiKey,
      description: request.description,
      outputName: request.id
    });
    manifest[request.id] = relativePath;
    console.log(`Generated ${request.id} (${callCount}/${MAX_CALLS})`);
  }

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Manifest written: ${MANIFEST_PATH}`);
  console.log(`PixelLab calls used: ${callCount}/${MAX_CALLS}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
