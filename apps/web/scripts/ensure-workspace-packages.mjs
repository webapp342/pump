#!/usr/bin/env node
/** Skip @pump/solana-sdk + @pump/xp rebuild when dist is newer than sources (deploy hot path). */
import { execSync } from "node:child_process";
import { stat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const repoRoot = path.join(webRoot, "../..");

const packages = [
  { name: "@pump/solana-sdk", dir: "packages/solana-sdk", distEntry: "dist/index.js" },
  { name: "@pump/xp", dir: "packages/pump-xp", distEntry: "dist/index.js" },
];

async function newestMtime(root, rel = "") {
  const abs = path.join(root, rel);
  let newest = 0;
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, await newestMtime(root, child));
    } else if (/\.(ts|tsx|json)$/.test(entry.name)) {
      const st = await stat(path.join(root, child));
      newest = Math.max(newest, st.mtimeMs);
    }
  }
  return newest;
}

async function ensurePackage(pkg) {
  const pkgRoot = path.join(repoRoot, pkg.dir);
  const distPath = path.join(pkgRoot, pkg.distEntry);
  try {
    const distStat = await stat(distPath);
    const srcMtime = await newestMtime(pkgRoot);
    if (srcMtime > 0 && distStat.mtimeMs >= srcMtime) {
      console.log(`[prebuild] skip ${pkg.name} (dist up to date)`);
      return;
    }
  } catch {
    // dist missing — build
  }
  console.log(`[prebuild] build ${pkg.name}`);
  execSync(`npm run build -w ${pkg.name}`, { stdio: "inherit", cwd: repoRoot });
}

for (const pkg of packages) {
  await ensurePackage(pkg);
}
