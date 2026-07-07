import "dotenv/config";
function required(name) {
    const value = process.env[name];
    if (!value?.trim())
        throw new Error(`${name} is required`);
    return value.trim();
}
function optional(name) {
    const value = process.env[name];
    return value?.trim() ? value.trim() : undefined;
}
function integer(name, fallback) {
    const value = optional(name);
    if (!value)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${name} must be a non-negative integer`);
    }
    return parsed;
}
function booleanFlag(name, fallback) {
    const value = optional(name);
    if (!value)
        return fallback;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
function privateKey(name) {
    const value = required(name);
    const normalized = value.startsWith("0x") ? value : `0x${value}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
        throw new Error(`${name} must be a 32-byte hex private key with 0x prefix`);
    }
    return normalized;
}
export const airdropKeeperConfig = {
    launchpadDatabaseUrl: required("LAUNCHPAD_DATABASE_URL"),
    rpcUrl: optional("RPC_URL") ?? optional("BASE_SEPOLIA_RPC_URL") ?? required("RPC_URL"),
    chainId: integer("CHAIN_ID", 84532),
    keeperPrivateKey: privateKey("AIRDROP_KEEPER_PRIVATE_KEY"),
    pollIntervalMs: integer("AIRDROP_KEEPER_POLL_MS", 60_000),
    once: booleanFlag("AIRDROP_KEEPER_ONCE", false)
};
