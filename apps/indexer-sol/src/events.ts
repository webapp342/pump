/**
 * Re-export decode surface used by the indexer entrypoint.
 * @see decode.ts for Anchor discriminator + borsh parsing.
 */
export {
  decodeProgramData,
  extractEventsFromLogs,
  eventDiscHex,
  type DecodedSolanaEvent,
} from "./decode.js";
