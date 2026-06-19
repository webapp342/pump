import { contracts } from "@/config/chain";
import { bondingCurveManagerAbi } from "@/lib/bonding-curve";
import { memeFactoryAbi } from "@/lib/abis/meme-factory";
import {
  CallPolicyVersion,
  toCallPolicy,
  toGasPolicy,
  toRateLimitPolicy,
  toTimestampPolicy,
} from "@zerodev/permissions/policies";
import type { Policy } from "@zerodev/permissions";

/** Max gas per UserOp — POC cap; tune after paymaster cost measurement. */
const MAX_GAS_PER_USER_OP = 500_000n;

/** Hourly tx cap for session key. */
const RATE_LIMIT_COUNT = 30;
const RATE_LIMIT_INTERVAL_SEC = 3600;

const SESSION_DAYS = 7;

export function buildPumpSessionPolicies(): Policy[] {
  const validUntil = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;

  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: [
      {
        target: contracts.bondingCurveManager,
        abi: bondingCurveManagerAbi,
        functionName: "buy",
      },
      {
        target: contracts.bondingCurveManager,
        abi: bondingCurveManagerAbi,
        functionName: "buyWithReferrer",
      },
      {
        target: contracts.bondingCurveManager,
        abi: bondingCurveManagerAbi,
        functionName: "sell",
      },
      {
        target: contracts.bondingCurveManager,
        abi: bondingCurveManagerAbi,
        functionName: "sellWithReferrer",
      },
      {
        target: contracts.bondingCurveManager,
        abi: bondingCurveManagerAbi,
        functionName: "sellWithPermit",
      },
      {
        target: contracts.bondingCurveManager,
        abi: bondingCurveManagerAbi,
        functionName: "sellWithReferrerAndPermit",
      },
      {
        target: contracts.memeFactory,
        abi: memeFactoryAbi,
        functionName: "createMeme",
      },
    ],
  });

  const gasPolicy = toGasPolicy({
    allowed: MAX_GAS_PER_USER_OP,
    enforcePaymaster: true,
  });

  const rateLimitPolicy = toRateLimitPolicy({
    count: RATE_LIMIT_COUNT,
    interval: RATE_LIMIT_INTERVAL_SEC,
  });

  const timestampPolicy = toTimestampPolicy({
    validUntil,
  });

  return [callPolicy, gasPolicy, rateLimitPolicy, timestampPolicy];
}
