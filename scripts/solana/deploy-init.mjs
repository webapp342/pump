#!/usr/bin/env node
/**
 * Pinocchio pump-launchpad checklist (primary Solana path).
 */
import { PROGRAM_IDS, PUMP_FEEL_DEFAULTS } from "../../packages/solana-sdk/src/index.ts";

console.log("=== Pump Solana — Pinocchio launchpad ===\n");
console.log(`  programId:  ${PROGRAM_IDS.launchpad}`);
console.log(`  rent tip:   ~0.20 SOL program + ~0.002 global PDA`);
console.log("\n=== PUMP_FEEL_DEFAULTS ===\n");
console.log(PUMP_FEEL_DEFAULTS);
console.log("\n=== Steps ===\n");
console.log("  1. bash scripts/solana/wsl-pinocchio-build.sh");
console.log("  2. bash scripts/solana/wsl-pinocchio-deploy.sh");
console.log("  3. npm run solana:initialize");
console.log("  4. create_meme / buy / sell via @pump/solana-sdk encoders");
