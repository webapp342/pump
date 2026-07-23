#!/usr/bin/env node
/**
 * On-chain curve + AMM quote audit for one mint.
 * Usage: node scripts/solana/audit-token-curve.mjs <MINT> [TRADER_WALLET]
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

const PROGRAM_ID = "Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus";
const DEFAULT_FEE_BPS = 125n;

const RPC = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
const mintArg = process.argv[2];
const traderArg = process.argv[3];

if (!RPC) {
  console.error("Set SOLANA_RPC_URL");
  process.exit(1);
}
if (!mintArg) {
  console.error("Usage: node scripts/solana/audit-token-curve.mjs <MINT> [TRADER]");
  process.exit(1);
}

const programId = new PublicKey(PROGRAM_ID);
const mint = new PublicKey(mintArg);

function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

function readU64(data, o) {
  return data.readBigUInt64LE(o);
}

function decodeCurve(data) {
  let o = 0;
  const readPk = () => {
    const pk = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return pk;
  };
  const readU64At = () => {
    const v = readU64(data, o);
    o += 8;
    return v;
  };
  return {
    mint: readPk(),
    creator: readPk(),
    tokenVault: readPk(),
    virtualTokenReserves: readU64At(),
    virtualSolReserves: readU64At(),
    realTokenReserves: readU64At(),
    realSolReserves: readU64At(),
    tokenTotalSupply: readU64At(),
    initialRealTokenReserves: readU64At(),
    complete: data[o],
    paused: data[o + 1],
  };
}

function decodeGlobal(data) {
  return {
    protocolFeeBps: readU64(data, 128),
    creatorFeeShareBps: readU64(data, 136),
    initialVirtualSolReserves: readU64(data, 168),
    initialRealTokenReserves: readU64(data, 184),
    tokenTotalSupply: readU64(data, 192),
  };
}

function decodePending(data) {
  return { pendingLamports: readU64(data, 32) };
}

const BPS = 10_000n;

function feeFromGross(gross, bps) {
  return (gross * bps) / BPS;
}

function quoteAmmSell(realSol, vaultBase, tokenIn, feeBps) {
  if (tokenIn <= 0n || realSol <= 0n || vaultBase <= 0n) return null;
  let gross = (tokenIn * realSol) / (vaultBase + tokenIn);
  if (gross > realSol) gross = realSol;
  const fee = feeFromGross(gross, feeBps);
  return { gross, fee, net: gross - fee };
}

function lamportsToSol(l) {
  return Number(l) / 1e9;
}

function fmtHuman(raw, decimals = 6) {
  return Number(raw) / 10 ** decimals;
}

const conn = new Connection(RPC, "confirmed");
const [globalPda] = pda([Buffer.from("global")]);
const [curvePda] = pda([Buffer.from("curve"), mint.toBuffer()]);
const [liquidityPda] = pda([Buffer.from("vault")]);

const [curveInfo, globalInfo, liqBal] = await Promise.all([
  conn.getAccountInfo(curvePda),
  conn.getAccountInfo(globalPda),
  conn.getBalance(liquidityPda),
]);

if (!curveInfo?.data) {
  console.error("Curve not found:", curvePda.toBase58());
  process.exit(1);
}

const curve = decodeCurve(curveInfo.data);
const g = globalInfo?.data ? decodeGlobal(globalInfo.data) : null;
const feeBps = g?.protocolFeeBps ?? DEFAULT_FEE_BPS;

let vaultBase = 0n;
try {
  const vaultAcc = await getAccount(conn, curve.tokenVault);
  vaultBase = vaultAcc.amount;
} catch (e) {
  console.warn("Vault ATA read failed:", e.message);
}

const sold = curve.initialRealTokenReserves - curve.realTokenReserves;
const circulating = curve.tokenTotalSupply - vaultBase;

console.log("=== Token curve audit ===");
console.log("mint:", mint.toBase58());
console.log("curve PDA:", curvePda.toBase58());
console.log("creator:", curve.creator.toBase58());
console.log("token vault:", curve.tokenVault.toBase58());
console.log("complete (graduated):", curve.complete);
console.log("paused:", curve.paused);
console.log("");
console.log("--- Reserves (raw) ---");
console.log("real_sol_reserves:", curve.realSolReserves.toString(), `(${lamportsToSol(curve.realSolReserves).toFixed(6)} SOL)`);
console.log("vault token balance:", vaultBase.toString(), `(${fmtHuman(vaultBase).toFixed(3)}M tokens @6dp)`);
console.log("real_token_reserves (bonding left):", curve.realTokenReserves.toString());
console.log("initial_real_token_reserves:", curve.initialRealTokenReserves.toString());
console.log("sold from bonding cap:", sold.toString(), `(${fmtHuman(sold).toFixed(3)}M)`);
console.log("circulating (supply - vault):", circulating.toString(), `(${fmtHuman(circulating).toFixed(3)}M)`);
console.log("");
console.log("shared liquidity vault SOL:", liqBal, `(${lamportsToSol(liqBal).toFixed(6)} SOL total platform)`);

if (curve.complete) {
  const spot = Number(curve.realSolReserves) / Number(vaultBase);
  console.log("");
  console.log("--- AMM phase ---");
  console.log("spot lamports/token (raw ratio):", spot.toExponential(4));
  const reserveRatio = Number(vaultBase) / Number(curve.initialRealTokenReserves);
  console.log("vault / initial_real ratio:", (reserveRatio * 100).toFixed(2) + "%");
  console.log("theoretical max-extract if sell ALL circulating:");
  const qAll = quoteAmmSell(curve.realSolReserves, vaultBase, circulating, feeBps);
  if (qAll) {
    console.log("  gross SOL:", lamportsToSol(qAll.gross).toFixed(6));
    console.log("  fee SOL:", lamportsToSol(qAll.fee).toFixed(6));
    console.log("  net SOL (trader receives):", lamportsToSol(qAll.net).toFixed(6));
    console.log("  SOL left in pool after:", lamportsToSol(curve.realSolReserves - qAll.gross).toFixed(6));
    const pct = (Number(qAll.gross) / Number(curve.realSolReserves)) * 100;
    console.log("  % of pool SOL extracted:", pct.toFixed(2) + "%");
    console.log("  % SOL locked with vault reserve:", (100 - pct).toFixed(2) + "%");
  }
}

if (traderArg) {
  const trader = new PublicKey(traderArg);
  const ata = getAssociatedTokenAddressSync(mint, trader);
  try {
    const bal = await getAccount(conn, ata);
    console.log("");
    console.log("--- Trader", trader.toBase58(), "---");
    console.log("token balance:", bal.amount.toString(), `(${fmtHuman(bal.amount).toFixed(3)}M)`);
    if (curve.complete && bal.amount > 0n) {
      const q = quoteAmmSell(curve.realSolReserves, vaultBase, bal.amount, feeBps);
      if (q) {
        console.log("max sell quote net SOL:", lamportsToSol(q.net).toFixed(6));
        console.log("max sell quote net USD @76:", (lamportsToSol(q.net) * 76).toFixed(2));
      }
    }
  } catch {
    console.log("trader ATA empty or missing");
  }
}

const [creatorFeesPda] = pda([Buffer.from("creator-fees"), curve.creator.toBuffer()]);
const creatorFeesInfo = await conn.getAccountInfo(creatorFeesPda);
if (creatorFeesInfo?.data) {
  const pending = decodePending(creatorFeesInfo.data);
  console.log("");
  console.log("creator pending fees:", pending.pendingLamports.toString(), `(${lamportsToSol(pending.pendingLamports).toFixed(6)} SOL)`);
}
