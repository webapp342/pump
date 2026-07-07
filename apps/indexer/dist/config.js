import "dotenv/config";
function required(name) {
    const value = process.env[name];
    if (!value || value.trim() === "") {
        throw new Error(`${name} is required`);
    }
    return value;
}
function optional(name) {
    const value = process.env[name];
    return value && value.trim() !== "" ? value : undefined;
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
function rpcUrlsFromEnv() {
    const raw = optional("RPC_URL") ?? optional("BASE_SEPOLIA_RPC_URL");
    if (!raw) {
        throw new Error("RPC_URL or BASE_SEPOLIA_RPC_URL is required");
    }
    return raw
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean);
}
export const config = {
    launchpadDatabaseUrl: required("LAUNCHPAD_DATABASE_URL"),
    vm1MainDatabaseUrl: optional("VM1_MAIN_DB_URL"),
    rpcUrl: rpcUrlsFromEnv()[0],
    rpcUrls: rpcUrlsFromEnv(),
    chainId: integer("CHAIN_ID", 84532),
    startBlock: BigInt(integer("INDEXER_START_BLOCK", 0)),
    confirmations: BigInt(integer("INDEXER_CONFIRMATIONS", 2)),
    chunkSize: BigInt(integer("INDEXER_CHUNK_SIZE", 1_000)),
    pollIntervalMs: integer("INDEXER_POLL_INTERVAL_MS", 5_000),
    stateKey: optional("INDEXER_STATE_KEY") ?? "launchpad_indexer",
    once: booleanFlag("INDEXER_ONCE", false),
    mvRefreshEnabled: booleanFlag("MV_REFRESH_ENABLED", false),
    redisPublishEnabled: booleanFlag("REDIS_PUBLISH_ENABLED", false),
    redisUrl: optional("REDIS_URL"),
    useWsBlocks: booleanFlag("INDEXER_USE_WS_BLOCKS", false),
    wsRpcUrl: optional("WS_RPC_URL") ?? optional("BASE_SEPOLIA_WS_URL"),
};
