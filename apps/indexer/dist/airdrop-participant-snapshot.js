import { queryQualifyingBuyVolumeBnb, resolveProgressTraderAddresses, } from "./airdrop-qualify-volume.js";
function decimalToNumber(value) {
    if (!value)
        return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
function weiStringToDecimal(wei) {
    if (!wei || wei === "0")
        return 0;
    const value = BigInt(wei);
    const whole = value / 10n ** 18n;
    const fraction = value % 10n ** 18n;
    const frac = fraction.toString().padStart(18, "0").replace(/0+$/, "");
    return Number(`${whole.toString()}${frac ? `.${frac}` : ""}`);
}
function computeProgress(input) {
    const socialPct = input.socialTotal > 0 ? (input.socialDone / input.socialTotal) * 100 : 100;
    const unlocked = input.socialPassed;
    let holdMet = !input.hasHold;
    let buyMet = !input.hasBuy;
    let holdPct = 100;
    let buyPct = 100;
    if (unlocked && input.hasHold && input.holdTarget > 0) {
        holdMet = input.holdCurrent >= input.holdTarget;
        holdPct = Math.min(100, (input.holdCurrent / input.holdTarget) * 100);
    }
    if (unlocked && input.hasBuy && input.buyTarget > 0) {
        buyMet = input.buyCurrent >= input.buyTarget;
        buyPct = Math.min(100, (input.buyCurrent / input.buyTarget) * 100);
    }
    const hasOnchain = input.hasHold || input.hasBuy;
    const onchainPct = !hasOnchain || !unlocked
        ? 0
        : input.hasHold && input.hasBuy
            ? (holdPct + buyPct) / 2
            : input.hasHold
                ? holdPct
                : buyPct;
    const onchainQualified = unlocked && hasOnchain && holdMet && buyMet;
    let progressPct;
    if (input.socialTotal > 0 && hasOnchain) {
        progressPct = Math.round(socialPct * 0.3 + onchainPct * 0.7);
    }
    else if (input.socialTotal > 0) {
        progressPct = Math.round(socialPct);
    }
    else if (hasOnchain) {
        progressPct = Math.round(onchainPct);
    }
    else {
        progressPct = 100;
    }
    return {
        holdMet,
        buyMet,
        onchainQualified,
        progressPct: Math.min(100, Math.max(0, progressPct)),
    };
}
/** Indexer-side snapshot refresh (indexed trades/positions only — no RPC). */
export async function refreshParticipantSnapshotIndexer(db, airdropId, address) {
    const normalized = address.toLowerCase();
    const airdropResult = await db.query(`
      SELECT id, linked_token, qualify_start, qualify_end, rules_json
      FROM airdrops
      WHERE id = $1::bigint
      LIMIT 1
    `, [airdropId]);
    const airdrop = airdropResult.rows[0];
    if (!airdrop)
        return;
    const requiredTasks = await db.query(`
      SELECT COUNT(*)::text AS count
      FROM airdrop_social_tasks
      WHERE airdrop_id = $1 AND is_required = true
    `, [airdropId]);
    const socialTotal = Number(requiredTasks.rows[0]?.count ?? 0);
    const doneTasks = await db.query(`
      SELECT COUNT(DISTINCT c.task_id)::text AS count
      FROM airdrop_task_completions c
      JOIN airdrop_social_tasks t ON t.id = c.task_id
      WHERE c.airdrop_id = $1
        AND c.address = $2
        AND t.is_required = true
    `, [airdropId, normalized]);
    const socialDone = Number(doneTasks.rows[0]?.count ?? 0);
    const participant = await db.query(`
      SELECT social_gate_passed_at
      FROM airdrop_participants
      WHERE airdrop_id = $1::bigint AND address = $2
    `, [airdropId, normalized]);
    const socialPassed = socialTotal === 0 ||
        socialDone >= socialTotal ||
        participant.rows[0]?.social_gate_passed_at != null;
    const minHoldWei = airdrop.rules_json?.onchain?.minHoldWei;
    const minBuyWei = airdrop.rules_json?.onchain?.minBuyBnbWei;
    const hasHold = Boolean(minHoldWei && minHoldWei !== "0");
    const hasBuy = Boolean(minBuyWei && minBuyWei !== "0");
    let holdCurrent = 0;
    let buyCurrent = 0;
    if (socialPassed && (hasHold || hasBuy)) {
        const traderAddresses = await resolveProgressTraderAddresses(db, normalized);
        const [holdRow, buyVolume] = await Promise.all([
            db.query(`
          SELECT COALESCE(token_balance, 0)::text AS token_balance
          FROM user_positions
          WHERE token_address = $1 AND address = $2
        `, [airdrop.linked_token, normalized]),
            queryQualifyingBuyVolumeBnb(db, {
                linkedToken: airdrop.linked_token,
                traderAddresses,
                qualifyStart: airdrop.qualify_start,
                qualifyEnd: airdrop.qualify_end,
            }),
        ]);
        holdCurrent = decimalToNumber(holdRow.rows[0]?.token_balance);
        buyCurrent = decimalToNumber(buyVolume);
    }
    const holdTarget = hasHold ? weiStringToDecimal(minHoldWei) : 0;
    const buyTarget = hasBuy ? weiStringToDecimal(minBuyWei) : 0;
    const progress = computeProgress({
        socialTotal,
        socialDone,
        socialPassed,
        hasHold,
        hasBuy,
        holdTarget,
        buyTarget,
        holdCurrent,
        buyCurrent,
    });
    const allocation = await db.query(`
      SELECT rank, amount::text
      FROM airdrop_allocations
      WHERE airdrop_id = $1::bigint AND address = $2
      LIMIT 1
    `, [airdropId, normalized]);
    const viewerRank = allocation.rows[0]?.rank ?? null;
    const claimableAmount = allocation.rows[0]?.amount ?? null;
    const progressPct = viewerRank != null ? 100 : progress.progressPct;
    await db.query(`
      INSERT INTO airdrop_participants (
        airdrop_id,
        address,
        social_gate_passed_at,
        social_tasks_total,
        social_tasks_completed,
        hold_met,
        buy_met,
        onchain_qualified,
        progress_pct,
        viewer_rank,
        claimable_amount,
        updated_at
      )
      VALUES (
        $1::bigint, $2,
        CASE WHEN $3::boolean THEN now() ELSE NULL END,
        $4, $5, $6, $7, $8, $9, $10, $11, now()
      )
      ON CONFLICT (airdrop_id, address) DO UPDATE SET
        social_gate_passed_at = COALESCE(
          airdrop_participants.social_gate_passed_at,
          CASE WHEN $3::boolean THEN now() ELSE NULL END
        ),
        social_tasks_total = EXCLUDED.social_tasks_total,
        social_tasks_completed = EXCLUDED.social_tasks_completed,
        hold_met = EXCLUDED.hold_met,
        buy_met = EXCLUDED.buy_met,
        onchain_qualified = EXCLUDED.onchain_qualified,
        progress_pct = EXCLUDED.progress_pct,
        viewer_rank = COALESCE(EXCLUDED.viewer_rank, airdrop_participants.viewer_rank),
        claimable_amount = COALESCE(EXCLUDED.claimable_amount, airdrop_participants.claimable_amount),
        updated_at = now()
    `, [
        airdropId,
        normalized,
        socialPassed,
        socialTotal,
        socialDone,
        progress.holdMet,
        progress.buyMet,
        progress.onchainQualified,
        progressPct,
        viewerRank,
        claimableAmount,
    ]);
}
export async function syncAllocationSnapshotsIndexer(db, airdropId) {
    const winners = await db.query(`SELECT address FROM airdrop_allocations WHERE airdrop_id = $1::bigint`, [airdropId]);
    for (const row of winners.rows) {
        await refreshParticipantSnapshotIndexer(db, airdropId, row.address);
    }
}
export async function markParticipantClaimedIndexer(db, airdropId, address, claimedAt) {
    await db.query(`
      UPDATE airdrop_participants
      SET claimed_at = $3,
          progress_pct = 100,
          updated_at = now()
      WHERE airdrop_id = $1::bigint AND address = $2
    `, [airdropId, address.toLowerCase(), claimedAt]);
}
