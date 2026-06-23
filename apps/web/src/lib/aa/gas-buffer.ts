/** +30% headroom on gas limits / cost estimates (matches Kernel UserOp bump). */
export const GAS_LIMIT_BUFFER_NUM = 13n;
export const GAS_LIMIT_BUFFER_DEN = 10n;

export function bufferGasLimit(gasUnits: bigint): bigint {
  if (gasUnits <= 0n) return 0n;
  return (gasUnits * GAS_LIMIT_BUFFER_NUM) / GAS_LIMIT_BUFFER_DEN;
}

export function bufferedGasCostWei(gasUnits: bigint, gasPriceWei: bigint): bigint {
  if (gasUnits <= 0n || gasPriceWei <= 0n) return 0n;
  return bufferGasLimit(gasUnits) * gasPriceWei;
}

export function bufferCostWei(costWei: bigint): bigint {
  if (costWei <= 0n) return 0n;
  return (costWei * GAS_LIMIT_BUFFER_NUM) / GAS_LIMIT_BUFFER_DEN;
}
