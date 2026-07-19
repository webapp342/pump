#!/usr/bin/env node
/**
 * Run Pinocchio build/deploy: bash on Linux/WSL shell, `wsl -e bash` from Windows npm.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const action = process.argv[2];
if (action !== "build" && action !== "deploy") {
  console.error("Usage: node scripts/solana/run-pinocchio.mjs <build|deploy>");
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptName = action === "build" ? "wsl-pinocchio-build.sh" : "wsl-pinocchio-deploy.sh";
const scriptPath = path.join(repoRoot, "scripts", "solana", scriptName);

function toWslPath(windowsPath) {
  const normalized = path.resolve(windowsPath);
  const match = /^([A-Za-z]):\\/.exec(normalized);
  if (!match) return normalized.replace(/\\/g, "/");
  return `/mnt/${match[1].toLowerCase()}/${normalized.slice(3).replace(/\\/g, "/")}`;
}

let cmd;
if (process.platform === "win32") {
  const wslScript = toWslPath(scriptPath);
  cmd = `wsl -e bash "${wslScript}"`;
} else {
  cmd = `bash "${scriptPath}"`;
}

execSync(cmd, {
  stdio: "inherit",
  cwd: repoRoot,
  env: process.env,
});
