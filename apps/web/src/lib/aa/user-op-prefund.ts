/** Kernel UserOp gas floors — must stay in sync with `kernel-account.ts` prepareUserOperation bumps. */
export const USER_OP_GAS_BUFFER_NUM = 13n;
export const USER_OP_GAS_BUFFER_DEN = 10n;
export const MIN_VERIFICATION_GAS = 150_000n;
export const MIN_VERIFICATION_GAS_DEPLOY = 400_000n;
export const MIN_CALL_GAS_LIMIT = 80_000n;
export const MIN_PRE_VERIFICATION_GAS = 40_000n;
const DEFAULT_PRE_VERIFICATION_GAS_ESTIMATE = 21_000n;

/** eth_estimateGas fallbacks for trade calls (see useTradeGasEstimate). */
export const DEFAULT_BUY_CALL_GAS = 130_000n;
export const DEFAULT_SELL_CALL_GAS = 150_000n;
export const DEFAULT_APPROVE_CALL_GAS = 55_000n;
/** Simple native or ERC20 transfer via smart wallet UserOp. */
export const DEFAULT_WITHDRAW_CALL_GAS = 65_000n;

export type UserOpGasLimits = {
  verificationGasLimit: bigint;
  callGasLimit: bigint;
  preVerificationGas: bigint;
};

export function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/** +30% buffer with floor — same as Kernel `prepareUserOperation` in kernel-account.ts. */
export function bumpGasLimit(value: bigint, floor: bigint): bigint {
  const buffered = (value * USER_OP_GAS_BUFFER_NUM) / USER_OP_GAS_BUFFER_DEN;
  return maxBigInt(buffered, floor);
}

/** Derive bumped UserOp gas limits from a call-level eth_estimateGas result. */
export function userOpLimitsFromCallGasEstimate(
  callGasEstimate: bigint,
  options?: { accountDeploy?: boolean; preVerificationGasEstimate?: bigint }
): UserOpGasLimits {
  const deploy = options?.accountDeploy ?? false;
  const vglFloor = deploy ? MIN_VERIFICATION_GAS_DEPLOY : MIN_VERIFICATION_GAS;
  const pvgEstimate = options?.preVerificationGasEstimate ?? DEFAULT_PRE_VERIFICATION_GAS_ESTIMATE;

  return {
    verificationGasLimit: bumpGasLimit(vglFloor, vglFloor),
    callGasLimit: bumpGasLimit(callGasEstimate, MIN_CALL_GAS_LIMIT),
    preVerificationGas: bumpGasLimit(pvgEstimate, MIN_PRE_VERIFICATION_GAS),
  };
}

export function userOpPrefundFromPreparedLimits(
  limits: UserOpGasLimits,
  maxFeePerGas: bigint
): bigint {
  if (maxFeePerGas <= 0n) return 0n;
  const totalGas =
    limits.verificationGasLimit + limits.callGasLimit + limits.preVerificationGas;
  return totalGas * maxFeePerGas;
}

/** ERC-4337 prefund = (verification + call + preVerification) × maxFeePerGas. */
export function userOpPrefundFromCallGasEstimate(
  callGasEstimate: bigint,
  maxFeePerGas: bigint,
  options?: { accountDeploy?: boolean }
): bigint {
  return userOpPrefundFromPreparedLimits(
    userOpLimitsFromCallGasEstimate(callGasEstimate, options),
    maxFeePerGas
  );
}
