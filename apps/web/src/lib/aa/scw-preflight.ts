import { formatEther, type Address, type PublicClient } from "viem";
import { createPumpPublicClient } from "@/lib/aa/kernel-account";
import { bufferedGasCostWei } from "@/lib/aa/gas-buffer";

/** Rough AA relay floor when no explicit estimate is available. */
const MIN_USER_OP_GAS_UNITS = 200_000n;

export async function getScwNativeBalance(
  scwAddress: Address,
  publicClient: PublicClient = createPumpPublicClient()
): Promise<bigint> {
  return publicClient.getBalance({ address: scwAddress });
}

export async function assertScwReadyForUserOp(
  scwAddress: Address,
  callValueWei: bigint
): Promise<void> {
  const publicClient = createPumpPublicClient();
  const balance = await getScwNativeBalance(scwAddress, publicClient);
  const gasPrice = await publicClient.getGasPrice();
  const gasReserve = bufferedGasCostWei(MIN_USER_OP_GAS_UNITS, gasPrice);
  const required = callValueWei + gasReserve;

  if (balance < required) {
    const have = formatEther(balance);
    const need = formatEther(required);
    throw new Error(
      `Smart wallet needs BNB for this trade. Have ${have} BNB, need about ${need} BNB (trade + gas) at ${scwAddress}. Deposit via Wallet → Deposit.`
    );
  }
}
