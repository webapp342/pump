/**
 * Simulate Arena Explore table activity: batch buy then batch sell in alternating txs.
 *
 * Each round (default 10 rounds = 20 on-chain txs):
 *   1. Fetch top-N by MCAP (filter=all) + top-N by age (filter=new) from /api/tokens
 *   2. TX: Multicall3 aggregate3Value — buyFor(wallet) each token with fixed BNB
 *   3. TX(s): bondingCurveManager.sellBatchWithPermit — max balance (max 10 tokens/tx)
 *
 * Usage:
 *   node --env-file=.env scripts/arena-table-sim.mjs
 *   node --env-file=.env scripts/arena-table-sim.mjs --dry-run
 *   node --env-file=.env scripts/arena-table-sim.mjs --rounds 5 --api-base http://localhost:3012
 *
 * Env (required):
 *   ARENA_SIM_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY
 *   NEXT_PUBLIC_BONDING_CURVE_MANAGER
 *   NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_CHAIN_ID
 *
 * Env (optional):
 *   NEXT_PUBLIC_APP_URL          — API base (default http://localhost:3012)
 *   ARENA_SIM_ROUNDS=10
 *   ARENA_SIM_LIST_SIZE=10       — per list (mcap + newest → up to 20 unique)
 *   ARENA_SIM_BUY_BNB=0.0001
 *   ARENA_SIM_SLIPPAGE_BPS=500
 *   ARENA_SIM_ROUND_DELAY_MS=4000
 */
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  http,
  maxUint256,
  parseEther,
  parseSignature,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const MAX_SELL_BATCH = 10;
const BPS = 10_000n;

const bondingCurveManagerAbi = [
  {
    type: "function",
    name: "quoteBuy",
    inputs: [
      { name: "token", type: "address" },
      { name: "zugIn", type: "uint256" },
    ],
    outputs: [
      { name: "tokenOut", type: "uint256" },
      { name: "feeZug", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quoteSell",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenIn", type: "uint256" },
    ],
    outputs: [
      { name: "zugOut", type: "uint256" },
      { name: "feeZug", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "buyFor",
    inputs: [
      { name: "token", type: "address" },
      { name: "recipient", type: "address" },
      { name: "minTokenOut", type: "uint256" },
    ],
    outputs: [{ name: "tokenOut", type: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "sellBatch",
    inputs: [
      {
        name: "sells",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "tokenIn", type: "uint256" },
          { name: "minZugOut", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "zugOuts", type: "uint256[]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sellBatchWithPermit",
    inputs: [
      {
        name: "sells",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "tokenIn", type: "uint256" },
          { name: "minZugOut", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ name: "zugOuts", type: "uint256[]" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "curves",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "creator", type: "address" },
      { name: "reserveZug", type: "uint256" },
      { name: "soldTokens", type: "uint256" },
      { name: "targetZug", type: "uint256" },
      { name: "virtualZugReserve", type: "uint256" },
      { name: "virtualTokenReserve", type: "uint256" },
      { name: "paused", type: "bool" },
    ],
    stateMutability: "view",
  },
];

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nonces",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
];

const multicall3Abi = [
  {
    type: "function",
    name: "aggregate3Value",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "value", type: "uint256" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
    stateMutability: "payable",
  },
];

function parseArgs(argv) {
  let rounds = Number(process.env.ARENA_SIM_ROUNDS ?? 10);
  let listSize = Number(process.env.ARENA_SIM_LIST_SIZE ?? 10);
  let dryRun = false;
  let apiBase = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3012";

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--rounds") rounds = Number(argv[++i] ?? rounds);
    else if (arg === "--list-size") listSize = Number(argv[++i] ?? listSize);
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--api-base") apiBase = String(argv[++i] ?? apiBase);
  }

  return { rounds, listSize, dryRun, apiBase: apiBase.replace(/\/$/, "") };
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function resolvePrivateKey() {
  const raw =
    process.env.ARENA_SIM_PRIVATE_KEY?.trim() || process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error("Missing env: ARENA_SIM_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY");
  }
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

function applySlippage(amount, slippageBps) {
  return (amount * (BPS - BigInt(slippageBps))) / BPS;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchArenaTokens(apiBase, { filter, sortKey, sortDir, limit }) {
  const params = new URLSearchParams({
    limit: String(limit),
    sortKey,
    sortDir,
    filter,
  });
  const res = await fetch(`${apiBase}/api/tokens?${params.toString()}`, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? `Failed to fetch tokens (${filter}/${sortKey})`);
  }
  return body.data ?? [];
}

function mergeTokenLists(mcapList, newestList) {
  const seen = new Set();
  const merged = [];
  for (const token of [...mcapList, ...newestList]) {
    const address = token.address.toLowerCase();
    if (seen.has(address)) continue;
    seen.add(address);
    merged.push(token);
  }
  return merged;
}

async function filterTradableTokens(publicClient, bondingCurveManager, tokens) {
  const tradable = [];
  for (const token of tokens) {
    try {
      const curve = await publicClient.readContract({
        address: bondingCurveManager,
        abi: bondingCurveManagerAbi,
        functionName: "curves",
        args: [token.address],
      });
      if (!curve[0] || curve[0] === "0x0000000000000000000000000000000000000000") continue;
      if (curve[7]) continue;
      if (token.status && token.status !== "BONDING") continue;
      tradable.push(token);
    } catch {
      // skip unreadable curve
    }
  }
  return tradable;
}

function chunk(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function buildBuyMulticall(
  publicClient,
  bondingCurveManager,
  recipient,
  tokens,
  buyWei,
  slippageBps
) {
  const calls = [];
  for (const token of tokens) {
    const address = token.address;
    const [tokenOut] = await publicClient.readContract({
      address: bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: "quoteBuy",
      args: [address, buyWei],
    });
    const minTokenOut = applySlippage(tokenOut, slippageBps);
    calls.push({
      target: bondingCurveManager,
      allowFailure: false,
      value: buyWei,
      callData: encodeFunctionData({
        abi: bondingCurveManagerAbi,
        functionName: "buyFor",
        args: [address, recipient, minTokenOut],
      }),
    });
  }
  return calls;
}

async function signPermit(publicClient, account, chainId, tokenAddress, spender, deadline) {
  const [name, nonce] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "name",
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "nonces",
      args: [account.address],
    }),
  ]);

  const signature = await account.signTypedData({
    domain: {
      name,
      version: "1",
      chainId,
      verifyingContract: tokenAddress,
    },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: {
      owner: account.address,
      spender,
      value: maxUint256,
      nonce,
      deadline,
    },
  });

  const parsed = parseSignature(signature);
  const v = parsed.yParity !== undefined ? parsed.yParity + 27 : Number(parsed.v ?? 27);
  return { v, r: parsed.r, s: parsed.s };
}

async function prepareSellBatches(
  publicClient,
  bondingCurveManager,
  account,
  tokens,
  slippageBps,
  chainId
) {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const allowanceReady = [];
  const permitNeeded = [];

  for (const token of tokens) {
    const address = token.address;
    const [balance, allowance] = await Promise.all([
      publicClient.readContract({
        address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      }),
      publicClient.readContract({
        address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account.address, bondingCurveManager],
      }),
    ]);
    if (balance <= 0n) continue;

    const [zugOut] = await publicClient.readContract({
      address: bondingCurveManager,
      abi: bondingCurveManagerAbi,
      functionName: "quoteSell",
      args: [address, balance],
    });
    if (zugOut <= 0n) continue;

    const minZugOut = applySlippage(zugOut, slippageBps);
    const sellItem = { token: address, tokenIn: balance, minZugOut };

    if (allowance >= balance) {
      allowanceReady.push(sellItem);
    } else {
      const { v, r, s } = await signPermit(
        publicClient,
        account,
        chainId,
        address,
        bondingCurveManager,
        deadline
      );
      permitNeeded.push({ ...sellItem, deadline, v, r, s });
    }
  }

  const batches = [];
  for (const group of chunk(allowanceReady, MAX_SELL_BATCH)) {
    batches.push({ functionName: "sellBatch", args: [group] });
  }
  for (const group of chunk(permitNeeded, MAX_SELL_BATCH)) {
    batches.push({ functionName: "sellBatchWithPermit", args: [group] });
  }
  return batches;
}

async function main() {
  const { rounds, listSize, dryRun, apiBase } = parseArgs(process.argv);
  const privateKey = resolvePrivateKey();
  const bondingCurveManager = requireEnv("NEXT_PUBLIC_BONDING_CURVE_MANAGER");
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL?.trim() || "https://bsc-testnet-rpc.publicnode.com";
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 97);
  const buyBnb = process.env.ARENA_SIM_BUY_BNB?.trim() || "0.0001";
  const buyWei = parseEther(buyBnb);
  const slippageBps = Number(process.env.ARENA_SIM_SLIPPAGE_BPS ?? 500);
  const roundDelayMs = Number(process.env.ARENA_SIM_ROUND_DELAY_MS ?? 4000);

  const pumpChain = defineChain({
    id: chainId,
    name: "Pump chain",
    nativeCurrency: { decimals: 18, name: "BNB", symbol: "BNB" },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: pumpChain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    account,
    chain: pumpChain,
    transport: http(rpcUrl),
  });

  const balance = await publicClient.getBalance({ address: account.address });
  const maxBuyPerRound = buyWei * BigInt(listSize * 2);
  const estimatedMin = maxBuyPerRound * BigInt(rounds);

  console.log("Arena table simulator");
  console.log(`  Wallet:     ${account.address}`);
  console.log(`  Balance:    ${formatEther(balance)} BNB`);
  console.log(`  API:        ${apiBase}`);
  console.log(`  Rounds:     ${rounds} (1 buy multicall/round + sellBatch up to ${MAX_SELL_BATCH}/tx)`);
  console.log(`  Per list:   top ${listSize} mcap + top ${listSize} newest`);
  console.log(`  Buy each:   ${buyBnb} BNB`);
  console.log(`  Est. min:   ~${formatEther(estimatedMin)} BNB spent on buys (ignoring gas)`);
  console.log(`  Dry run:    ${dryRun}`);

  if (balance < estimatedMin) {
    console.warn("  WARNING: balance may be insufficient for all rounds.");
  }

  const txHashes = [];
  let txCount = 0;

  for (let round = 1; round <= rounds; round += 1) {
    console.log(`\n—— Round ${round}/${rounds} ——`);

    const [mcapList, newestList] = await Promise.all([
      fetchArenaTokens(apiBase, {
        filter: "all",
        sortKey: "mcap",
        sortDir: "desc",
        limit: listSize,
      }),
      fetchArenaTokens(apiBase, {
        filter: "new",
        sortKey: "age",
        sortDir: "desc",
        limit: listSize,
      }),
    ]);

    const merged = mergeTokenLists(mcapList, newestList);
    const tradable = await filterTradableTokens(publicClient, bondingCurveManager, merged);

    if (tradable.length === 0) {
      throw new Error("No tradable tokens found for this round.");
    }

    console.log(
      `  Targets (${tradable.length}): ${tradable.map((t) => t.symbol).join(", ")}`
    );

    const buyCalls = await buildBuyMulticall(
      publicClient,
      bondingCurveManager,
      account.address,
      tradable,
      buyWei,
      slippageBps
    );

    const totalBuyValue = buyWei * BigInt(buyCalls.length);

    if (dryRun) {
      console.log(`  [dry-run] buy multicall: ${buyCalls.length} tokens, ${formatEther(totalBuyValue)} BNB`);
    } else {
      const buyHash = await walletClient.writeContract({
        address: MULTICALL3,
        abi: multicall3Abi,
        functionName: "aggregate3Value",
        args: [buyCalls],
        value: totalBuyValue,
      });
      await publicClient.waitForTransactionReceipt({ hash: buyHash });
      txCount += 1;
      txHashes.push(buyHash);
      console.log(`  TX ${txCount} buy:  ${buyHash} (${buyCalls.length} tokens)`);
    }

    if (!dryRun && roundDelayMs > 0) {
      await sleep(Math.min(roundDelayMs, 2000));
    }

    if (dryRun) {
      const sellTxCount = Math.ceil(tradable.length / MAX_SELL_BATCH);
      console.log(
        `  [dry-run] sell: up to ${sellTxCount} sellBatch tx(s), ${tradable.length} tokens max each`
      );
    } else {
      const sellBatches = await prepareSellBatches(
        publicClient,
        bondingCurveManager,
        account,
        tradable,
        slippageBps,
        chainId
      );

      if (sellBatches.length === 0) {
        console.warn("  No sell targets (zero balances?) — skipping sell");
      } else {
        for (const batch of sellBatches) {
          const sellHash = await walletClient.writeContract({
            address: bondingCurveManager,
            abi: bondingCurveManagerAbi,
            functionName: batch.functionName,
            args: batch.args,
          });
          await publicClient.waitForTransactionReceipt({ hash: sellHash });
          txCount += 1;
          txHashes.push(sellHash);
          console.log(
            `  TX ${txCount} sell (${batch.functionName}): ${sellHash} (${batch.args[0].length} tokens)`
          );
        }
      }
    }

    if (!dryRun && round < rounds && roundDelayMs > 0) {
      console.log(`  Waiting ${roundDelayMs}ms before next round…`);
      await sleep(roundDelayMs);
    }
  }

  console.log(`\nDone. On-chain txs: ${txCount}${dryRun ? " (dry-run)" : ""}`);
  if (txHashes.length > 0) {
    console.log("Tx hashes:");
    for (const hash of txHashes) console.log(`  ${hash}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
