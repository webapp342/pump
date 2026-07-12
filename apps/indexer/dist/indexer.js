import { createPublicClient, fallback, http, webSocket, parseEventLogs } from "viem";
import { config } from "./config.js";
import { closePools, createPools, getIndexerStartBlock, loadContractRegistry, updateIndexerState } from "./db.js";
import { bondingCurveManagerAbi, memeFactoryAbi, pumpAirdropManagerAbi } from "./abi.js";
import { LaunchpadEventHandlers } from "./handlers.js";
import { PointsBridge } from "./points.js";
import { scheduleMvRefresh } from "./mv-refresh.js";
import { closeRedis } from "./redis-publish.js";
import { closeRedisCache } from "./redis-cache.js";
const pools = createPools(config.launchpadDatabaseUrl, config.vm1MainDatabaseUrl);
function createChainClient() {
    if (config.useWsBlocks && config.wsRpcUrl) {
        return createPublicClient({
            transport: webSocket(config.wsRpcUrl, {
                timeout: 30_000,
                reconnect: true,
            }),
        });
    }
    return createPublicClient({
        transport: config.rpcUrls.length > 1
            ? fallback(config.rpcUrls.map((url) => http(url, { timeout: 30_000 })))
            : http(config.rpcUrl, { timeout: 30_000 }),
    });
}
const publicClient = createChainClient();
const LOG_FETCH_MAX_RETRIES = 6;
const LOG_FETCH_BASE_DELAY_MS = 1_500;
let shuttingDown = false;
process.on("SIGINT", () => {
    shuttingDown = true;
});
process.on("SIGTERM", () => {
    shuttingDown = true;
});
async function main() {
    const registry = await loadContractRegistry(pools.launchpad);
    const contracts = [
        { address: registry.memeFactory, abi: memeFactoryAbi },
        { address: registry.bondingCurveManager, abi: bondingCurveManagerAbi }
    ];
    if (registry.pumpAirdropManager) {
        contracts.push({ address: registry.pumpAirdropManager, abi: pumpAirdropManagerAbi });
    }
    const handlers = new LaunchpadEventHandlers({
        launchpadPool: pools.launchpad,
        pointsBridge: new PointsBridge(pools.vm1),
        publicClient
    });
    console.log(`launchpad indexer ready: chain=${config.chainId}, rpc=${config.rpcUrls.join(" | ")}, mode=${config.useWsBlocks && config.wsRpcUrl ? `watchBlocks(${config.wsRpcUrl})` : "poll"}, airdrop=${registry.pumpAirdropManager ?? "disabled"}, contracts=${contracts
        .map((contract) => contract.address)
        .join(", ")}`);
    if (config.useWsBlocks && config.wsRpcUrl) {
        await runWatchBlocksLoop(contracts, handlers);
        return;
    }
    await runPollLoop(contracts, handlers);
}
async function runPollLoop(contracts, handlers) {
    while (!shuttingDown) {
        const fromBlock = await getIndexerStartBlock(pools.launchpad, config.stateKey, config.startBlock);
        const latestBlock = await publicClient.getBlockNumber();
        const safeBlock = latestBlock > config.confirmations ? latestBlock - config.confirmations : 0n;
        if (fromBlock > safeBlock) {
            if (config.once)
                break;
            await sleep(config.pollIntervalMs);
            continue;
        }
        const toBlock = minBigInt(safeBlock, fromBlock + config.chunkSize - 1n);
        await processRangeAdaptive(contracts, handlers, fromBlock, toBlock);
        await updateIndexerState(pools.launchpad, config.stateKey, toBlock);
        scheduleMvRefresh(pools.launchpad);
        console.log(`indexed blocks ${fromBlock.toString()}-${toBlock.toString()}`);
        if (config.once)
            break;
    }
}
async function runWatchBlocksLoop(contracts, handlers) {
    await catchUpToSafeHead(contracts, handlers);
    if (config.once)
        return;
    return new Promise((resolve) => {
        let processing = false;
        const unwatch = publicClient.watchBlocks({
            onBlock: (block) => {
                if (shuttingDown) {
                    unwatch();
                    resolve();
                    return;
                }
                if (processing)
                    return;
                processing = true;
                void (async () => {
                    try {
                        await indexThroughSafeBlock(contracts, handlers, block.number);
                    }
                    catch (error) {
                        console.error("watchBlocks index error:", error);
                    }
                    finally {
                        processing = false;
                    }
                })();
            },
            onError: (error) => {
                console.warn("watchBlocks error:", error);
            },
        });
    });
}
async function catchUpToSafeHead(contracts, handlers) {
    while (!shuttingDown) {
        const latestBlock = await publicClient.getBlockNumber();
        const hasMore = await indexThroughSafeBlock(contracts, handlers, latestBlock);
        if (!hasMore)
            break;
    }
}
async function indexThroughSafeBlock(contracts, handlers, latestBlock) {
    const fromBlock = await getIndexerStartBlock(pools.launchpad, config.stateKey, config.startBlock);
    const safeBlock = latestBlock > config.confirmations ? latestBlock - config.confirmations : 0n;
    if (fromBlock > safeBlock)
        return false;
    const toBlock = minBigInt(safeBlock, fromBlock + config.chunkSize - 1n);
    await processRangeAdaptive(contracts, handlers, fromBlock, toBlock);
    await updateIndexerState(pools.launchpad, config.stateKey, toBlock);
    scheduleMvRefresh(pools.launchpad);
    console.log(`indexed blocks ${fromBlock.toString()}-${toBlock.toString()}`);
    return toBlock < safeBlock;
}
async function processRangeAdaptive(contracts, handlers, fromBlock, toBlock) {
    try {
        await processRange(contracts, handlers, fromBlock, toBlock);
    }
    catch (error) {
        if (isLogRangeLimitError(error) && toBlock > fromBlock) {
            const mid = fromBlock + (toBlock - fromBlock) / 2n;
            await processRangeAdaptive(contracts, handlers, fromBlock, mid);
            await processRangeAdaptive(contracts, handlers, mid + 1n, toBlock);
            return;
        }
        throw error;
    }
}
async function processRange(contracts, handlers, fromBlock, toBlock) {
    const rawLogs = [];
    for (const contract of contracts) {
        const logs = await fetchLogsWithRetry({
            address: contract.address,
            fromBlock,
            toBlock
        });
        rawLogs.push(...logs);
        await sleep(250);
    }
    const decodedLogs = contracts.flatMap((contract) => parseEventLogs({
        abi: contract.abi,
        logs: filterLogsByAddress(rawLogs, contract.address),
        strict: false
    }));
    decodedLogs.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber)
            return a.blockNumber < b.blockNumber ? -1 : 1;
        return (a.logIndex ?? 0) - (b.logIndex ?? 0);
    });
    for (const log of decodedLogs) {
        await handlers.handle({
            eventName: log.eventName,
            args: log.args,
            address: log.address,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex
        });
    }
}
async function fetchLogsWithRetry(params) {
    let lastError;
    for (let attempt = 0; attempt < LOG_FETCH_MAX_RETRIES; attempt++) {
        try {
            return await publicClient.getLogs({
                address: params.address,
                fromBlock: params.fromBlock,
                toBlock: params.toBlock
            });
        }
        catch (error) {
            lastError = error;
            if (!isLogRangeLimitError(error) || attempt === LOG_FETCH_MAX_RETRIES - 1) {
                throw error;
            }
            const delay = LOG_FETCH_BASE_DELAY_MS * 2 ** attempt;
            console.warn(`getLogs rate limited for ${params.address} blocks ${params.fromBlock}-${params.toBlock}, retry ${attempt + 1}/${LOG_FETCH_MAX_RETRIES} in ${delay}ms`);
            await sleep(delay);
        }
    }
    throw lastError;
}
function isLogRangeLimitError(error) {
    if (!error || typeof error !== "object")
        return false;
    const e = error;
    if (e.code === -32005 || e.code === 429)
        return true;
    const blob = [e.details, e.shortMessage, e.message]
        .filter((part) => typeof part === "string")
        .join(" ")
        .toLowerCase();
    if (blob.includes("limit"))
        return true;
    // Alchemy free tier: eth_getLogs max 10 blocks (code -32600, no "limit" in message)
    if (blob.includes("block range") || blob.includes("free tier") || blob.includes("eth_getlogs")) {
        return true;
    }
    if (e.code === -32600 && blob.includes("block"))
        return true;
    if (e.cause)
        return isLogRangeLimitError(e.cause);
    return false;
}
function filterLogsByAddress(logs, address) {
    const normalized = address.toLowerCase();
    return logs.filter((log) => log.address.toLowerCase() === normalized);
}
function minBigInt(a, b) {
    return a < b ? a : b;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
main()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(async () => {
    await closeRedis();
    await closeRedisCache();
    await closePools(pools);
});
