import { getAddress } from "viem";
import { readAdminEnvVariables } from "@/lib/admin/env-files";
import { getLaunchpadPool } from "@/lib/db/launchpad";

const REGISTRY_KEYS = {
  memeFactory: "meme_factory",
  bondingCurveManager: "bonding_curve_manager",
  pumpAirdropManager: "pump_airdrop_manager",
} as const;

export type ContractRegistrySeedResult =
  | {
      ok: true;
      chainId: number;
      memeFactory: string;
      bondingCurveManager: string;
      pumpAirdropManager: string | null;
    }
  | {
      ok: false;
      reason: string;
    };

function normalizeEnvAddress(value: string | undefined | null): `0x${string}` | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

function envVar(variables: { key: string; value: string }[], key: string): string | undefined {
  return variables.find((row) => row.key === key)?.value.trim() || undefined;
}

/** Resolve launchpad contract addresses from web process.env + optional Indexer .env file. */
export async function readContractAddressesFromEnv(): Promise<{
  chainId: number;
  memeFactory: `0x${string}` | null;
  bondingCurveManager: `0x${string}` | null;
  pumpAirdropManager: `0x${string}` | null;
}> {
  let chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? process.env.CHAIN_ID ?? 84532);
  let memeFactory = normalizeEnvAddress(process.env.NEXT_PUBLIC_MEME_FACTORY);
  let bondingCurveManager = normalizeEnvAddress(process.env.NEXT_PUBLIC_BONDING_CURVE_MANAGER);
  let pumpAirdropManager = normalizeEnvAddress(process.env.NEXT_PUBLIC_AIRDROP_MANAGER);

  try {
    const { variables } = await readAdminEnvVariables("indexer");
    const chainRaw = envVar(variables, "CHAIN_ID") ?? envVar(variables, "ZUGCHAIN_CHAIN_ID");
    if (chainRaw && /^\d+$/.test(chainRaw)) {
      chainId = Number(chainRaw);
    }
    memeFactory =
      memeFactory ??
      normalizeEnvAddress(envVar(variables, "MEME_FACTORY")) ??
      normalizeEnvAddress(envVar(variables, "NEXT_PUBLIC_MEME_FACTORY"));
    bondingCurveManager =
      bondingCurveManager ??
      normalizeEnvAddress(envVar(variables, "BONDING_CURVE_MANAGER")) ??
      normalizeEnvAddress(envVar(variables, "NEXT_PUBLIC_BONDING_CURVE_MANAGER"));
    pumpAirdropManager =
      pumpAirdropManager ?? normalizeEnvAddress(envVar(variables, "PUMP_AIRDROP_MANAGER"));
  } catch {
    // Local dev without PUMP_INDEXER_ENV_PATH — web .env only.
  }

  return { chainId, memeFactory, bondingCurveManager, pumpAirdropManager };
}

/** Upsert active rows in contract_registry from env (used after admin data wipe). */
export async function syncContractRegistryFromEnv(): Promise<ContractRegistrySeedResult> {
  const { chainId, memeFactory, bondingCurveManager, pumpAirdropManager } =
    await readContractAddressesFromEnv();

  if (!memeFactory || !bondingCurveManager) {
    return {
      ok: false,
      reason:
        "Set NEXT_PUBLIC_MEME_FACTORY and NEXT_PUBLIC_BONDING_CURVE_MANAGER in Pump Web .env (or MEME_FACTORY / BONDING_CURVE_MANAGER in Indexer .env).",
    };
  }

  if (!Number.isFinite(chainId) || chainId <= 0) {
    return {
      ok: false,
      reason: "Invalid CHAIN_ID / NEXT_PUBLIC_CHAIN_ID in environment.",
    };
  }

  const pool = getLaunchpadPool();

  const upsert = async (contractKey: string, address: `0x${string}`) => {
    await pool.query(
      `
        INSERT INTO contract_registry (
          contract_key,
          chain_id,
          address,
          is_active,
          updated_at
        ) VALUES ($1, $2, $3, true, now())
        ON CONFLICT (contract_key) DO UPDATE
        SET chain_id = EXCLUDED.chain_id,
            address = EXCLUDED.address,
            is_active = true,
            updated_at = now()
      `,
      [contractKey, chainId, address.toLowerCase()]
    );
  };

  await upsert(REGISTRY_KEYS.memeFactory, memeFactory);
  await upsert(REGISTRY_KEYS.bondingCurveManager, bondingCurveManager);

  if (pumpAirdropManager) {
    await upsert(REGISTRY_KEYS.pumpAirdropManager, pumpAirdropManager);
  } else {
    await pool.query(
      `
        UPDATE contract_registry
        SET is_active = false, updated_at = now()
        WHERE contract_key = $1
      `,
      [REGISTRY_KEYS.pumpAirdropManager]
    );
  }

  return {
    ok: true,
    chainId,
    memeFactory: memeFactory.toLowerCase(),
    bondingCurveManager: bondingCurveManager.toLowerCase(),
    pumpAirdropManager: pumpAirdropManager?.toLowerCase() ?? null,
  };
}
