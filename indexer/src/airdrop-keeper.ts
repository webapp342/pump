import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import { airdropKeeperConfig } from "./airdrop-keeper-config.js";
import { buildWinnerAmounts, sumAmounts } from "./airdrop-distribution.js";
import { buildAllocationsWithProofs } from "./airdrop-merkle.js";
import { pumpAirdropManagerAbi } from "./abi.js";
import { closePools, createPools, loadContractRegistry } from "./db.js";
import { syncAllocationSnapshotsIndexer } from "./airdrop-participant-snapshot.js";

type AirdropRules = {
  onchain?: {
    minHoldWei?: string;
    minBuyBnbWei?: string;
  };
};

type PendingAirdrop = {
  id: string;
  on_chain_id: string;
  linked_token: string;
  total_funded: string;
  qualify_start: Date;
  qualify_end: Date;
  rules_json: AirdropRules;
};

type CandidateRow = {
  address: string;
  hold_wei: string;
  buy_bnb: string;
};

/** `PumpAirdropManager.airdrops()` return tuple. */
type OnChainAirdropState = readonly [
  Address,
  Address,
  Address,
  bigint,
  bigint,
  bigint,
  Hex,
  Hex,
  bigint,
  bigint,
  bigint,
  bigint,
  number,
  boolean
];

const pools = createPools(airdropKeeperConfig.launchpadDatabaseUrl);
const account = privateKeyToAccount(airdropKeeperConfig.keeperPrivateKey);

const chain = defineChain({
  id: airdropKeeperConfig.chainId,
  name: "Pump Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: [airdropKeeperConfig.rpcUrl] } }
});

const publicClient = createPublicClient({
  chain,
  transport: http(airdropKeeperConfig.rpcUrl, { timeout: 30_000 })
});

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(airdropKeeperConfig.rpcUrl, { timeout: 30_000 })
});

let shuttingDown = false;

process.on("SIGINT", () => {
  shuttingDown = true;
});

process.on("SIGTERM", () => {
  shuttingDown = true;
});

async function main(): Promise<void> {
  const registry = await loadContractRegistry(pools.launchpad);
  if (!registry.pumpAirdropManager) {
    throw new Error("pump_airdrop_manager missing in contract_registry / PUMP_AIRDROP_MANAGER");
  }

  console.log(
    `airdrop keeper ready: chain=${airdropKeeperConfig.chainId}, manager=${registry.pumpAirdropManager}, keeper=${account.address}`
  );

  while (!shuttingDown) {
    const pending = await listPendingAirdrops();
    for (const airdrop of pending) {
      if (shuttingDown) break;
      try {
        await finalizeOne(publicClient, registry.pumpAirdropManager, airdrop);
      } catch (error) {
        console.error(`finalize failed for airdrop ${airdrop.id}:`, error);
      }
    }

    if (airdropKeeperConfig.once) break;
    await sleep(airdropKeeperConfig.pollIntervalMs);
  }
}

async function listPendingAirdrops(): Promise<PendingAirdrop[]> {
  const result = await pools.launchpad.query<PendingAirdrop>(
    `
      SELECT id, on_chain_id, linked_token, total_funded, qualify_start, qualify_end, rules_json
      FROM airdrops
      WHERE status = 'ACTIVE'
        AND merkle_root IS NULL
        AND qualify_end <= now()
        AND on_chain_id IS NOT NULL
      ORDER BY qualify_end ASC
      LIMIT 3
    `
  );
  return result.rows;
}

async function finalizeOne(
  client: PublicClient,
  manager: Address,
  airdrop: PendingAirdrop
): Promise<void> {
  const onChainStatus = (await client.readContract({
    address: manager,
    abi: pumpAirdropManagerAbi,
    functionName: "airdrops",
    args: [BigInt(airdrop.on_chain_id)]
  })) as OnChainAirdropState;

  const status = onChainStatus[12];
  if (status !== 0) {
    console.log(`airdrop ${airdrop.on_chain_id} already finalized on-chain, skipping`);
    return;
  }

  const rules = airdrop.rules_json ?? {};
  const minHoldWei = rules.onchain?.minHoldWei ? BigInt(rules.onchain.minHoldWei) : 0n;
  const minBuyBnbWei = rules.onchain?.minBuyBnbWei ? BigInt(rules.onchain.minBuyBnbWei) : 0n;

  if (minHoldWei === 0n && minBuyBnbWei === 0n) {
    console.warn(`airdrop ${airdrop.id} has no on-chain rules in rules_json, skipping`);
    return;
  }

  const candidates = await loadCandidates(airdrop, minHoldWei, minBuyBnbWei);
  const socialOk = await filterSocialGate(airdrop.id, candidates.map((c) => c.address));
  const filtered = candidates.filter((c) => socialOk.has(c.address.toLowerCase()));

  // Qualify-end hold from indexed bonding-curve trades (public RPCs lack archive state).
  const holds = await snapshotHoldsAtQualifyEnd(
    airdrop,
    filtered.map((c) => c.address)
  );

  const qualified = filtered
    .map((row) => {
      const address = row.address.toLowerCase();
      const holdWei = holds.get(address) ?? 0n;
      const buyWei = decimalToWei(row.buy_bnb);
      const holdOk = minHoldWei === 0n || holdWei >= minHoldWei;
      const buyOk = minBuyBnbWei === 0n || buyWei >= minBuyBnbWei;
      if (!holdOk || !buyOk) return null;
      return { address: address as Address, holdWei };
    })
    .filter((row): row is { address: Address; holdWei: bigint } => row !== null)
    .sort((a, b) => (a.holdWei === b.holdWei ? 0 : a.holdWei > b.holdWei ? -1 : 1))
    .slice(0, 100);

  if (qualified.length === 0) {
    console.warn(
      `airdrop ${airdrop.id}: no qualified winners, marking CLOSED in DB (sweep full reward via admin after claim window)`
    );
    await pools.launchpad.query(
      `
        UPDATE airdrops
        SET status = 'CLOSED',
            total_allocated = 0,
            updated_at = now()
        WHERE id = $1
          AND merkle_root IS NULL
      `,
      [airdrop.id]
    );
    return;
  }

  const totalFundedWei = decimalToWei(airdrop.total_funded);
  const amounts = buildWinnerAmounts(totalFundedWei, qualified.length);
  const entries = qualified.map((row, index) => ({
    address: row.address,
    amount: amounts[index]!
  }));
  const totalAllocated = sumAmounts(amounts);
  const { root, allocations } = buildAllocationsWithProofs(entries);

  const { request } = await publicClient.simulateContract({
    address: manager,
    abi: pumpAirdropManagerAbi,
    functionName: "finalizeAirdrop",
    args: [BigInt(airdrop.on_chain_id), root, totalAllocated],
    account
  });

  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });

  await pools.launchpad.query(
    `
      UPDATE airdrops
      SET merkle_root = $2,
          total_allocated = $3,
          status = 'FINALIZED',
          updated_at = now()
      WHERE id = $1
    `,
    [airdrop.id, root.toLowerCase(), weiToDecimalString(totalAllocated)]
  );

  for (let i = 0; i < allocations.length; i++) {
    const row = allocations[i]!;
    await pools.launchpad.query(
      `
        INSERT INTO airdrop_allocations (airdrop_id, address, rank, amount, proof_path)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (airdrop_id, address) DO UPDATE
        SET rank = EXCLUDED.rank,
            amount = EXCLUDED.amount,
            proof_path = EXCLUDED.proof_path
      `,
      [
        airdrop.id,
        row.address.toLowerCase(),
        i + 1,
        weiToDecimalString(row.amount),
        JSON.stringify(row.proof)
      ]
    );
  }

  await syncAllocationSnapshotsIndexer(pools.launchpad, airdrop.id).catch(() => undefined);

  console.log(
    `finalized airdrop ${airdrop.on_chain_id}: winners=${qualified.length}, root=${root}, tx=${hash}`
  );
}

async function loadCandidates(
  airdrop: PendingAirdrop,
  minHoldWei: bigint,
  minBuyBnbWei: bigint
): Promise<CandidateRow[]> {
  const result = await pools.launchpad.query<CandidateRow>(
    `
      WITH buy_volume AS (
        SELECT trader_address AS address, COALESCE(SUM(zug_amount), 0) AS buy_bnb
        FROM trades
        WHERE token_address = $1
          AND side = 'BUY'
          AND block_time >= $2
          AND block_time <= $3
        GROUP BY trader_address
      ),
      holders AS (
        SELECT LOWER(trader_address) AS address,
               SUM(CASE WHEN side = 'BUY' THEN token_amount ELSE -token_amount END) AS hold_wei
        FROM trades
        WHERE token_address = $1
          AND block_time <= $3
        GROUP BY LOWER(trader_address)
        HAVING SUM(CASE WHEN side = 'BUY' THEN token_amount ELSE -token_amount END) > 0
      )
      SELECT DISTINCT LOWER(COALESCE(b.address, h.address)) AS address,
             COALESCE(h.hold_wei::text, '0') AS hold_wei,
             COALESCE(b.buy_bnb::text, '0') AS buy_bnb
      FROM buy_volume b
      FULL OUTER JOIN holders h ON LOWER(h.address) = LOWER(b.address)
      WHERE ($4::numeric = 0 OR COALESCE(b.buy_bnb, 0) > 0 OR COALESCE(h.hold_wei, 0) > 0)
    `,
    [
      airdrop.linked_token,
      airdrop.qualify_start,
      airdrop.qualify_end,
      minBuyBnbWei > 0n ? 1 : 0
    ]
  );

  return result.rows;
}

async function filterSocialGate(airdropId: string, addresses: string[]): Promise<Set<string>> {
  const required = await pools.launchpad.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM airdrop_social_tasks
      WHERE airdrop_id = $1 AND is_required = true
    `,
    [airdropId]
  );

  const requiredCount = Number(required.rows[0]?.count ?? 0);
  if (requiredCount === 0) {
    return new Set(addresses.map((a) => a.toLowerCase()));
  }

  if (addresses.length === 0) return new Set();

  const result = await pools.launchpad.query<{ address: string }>(
    `
      SELECT c.address
      FROM airdrop_task_completions c
      JOIN airdrop_social_tasks t ON t.id = c.task_id
      WHERE c.airdrop_id = $1
        AND t.is_required = true
        AND c.address = ANY($2::text[])
      GROUP BY c.address
      HAVING COUNT(DISTINCT c.task_id) >= $3
    `,
    [airdropId, addresses.map((a) => a.toLowerCase()), requiredCount]
  );

  return new Set(result.rows.map((row) => row.address.toLowerCase()));
}

/** Net token balance at qualify end from indexed bonding-curve trades. */
async function snapshotHoldsAtQualifyEnd(
  airdrop: PendingAirdrop,
  addresses: string[]
): Promise<Map<string, bigint>> {
  const holds = new Map<string, bigint>();
  const normalized = addresses.map((a) => a.toLowerCase());
  for (const address of normalized) {
    holds.set(address, 0n);
  }
  if (normalized.length === 0) return holds;

  const result = await pools.launchpad.query<{ address: string; hold_amount: string }>(
    `
      SELECT LOWER(trader_address) AS address,
             COALESCE(SUM(
               CASE WHEN side = 'BUY' THEN token_amount ELSE -token_amount END
             ), 0)::text AS hold_amount
      FROM trades
      WHERE token_address = $1
        AND block_time <= $2::timestamptz
        AND LOWER(trader_address) = ANY($3::text[])
      GROUP BY LOWER(trader_address)
    `,
    [airdrop.linked_token, airdrop.qualify_end, normalized]
  );

  for (const row of result.rows) {
    holds.set(row.address, decimalToWei(row.hold_amount));
  }

  return holds;
}

function decimalToWei(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  const padded = `${fraction}000000000000000000`.slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(padded);
}

function weiToDecimalString(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 10n ** 18n;
  const fraction = abs % 10n ** 18n;
  const frac = fraction.toString().padStart(18, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${frac ? `.${frac}` : ""}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools(pools);
  });
