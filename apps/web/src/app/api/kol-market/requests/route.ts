import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { normalizeAddressParam } from "@/lib/address";
import { ensureDynamicRoute, searchParam } from "@/lib/api/route-dynamic";
import { fetchNativeUsdPrice } from "@/lib/native-usd-price";
import { usdToNativeHuman } from "@/lib/kol-market-escrow";
import {
  assertSponsorOwnsToken,
  confirmKolCalloutRequestEscrow,
  createKolCalloutRequest,
  createKolCalloutRequestDraft,
  getKolProfileDetail,
  listKolRequestsForKol,
} from "@/lib/db/kol-market";
import { KOL_MARKET_COPY } from "@/lib/kol-market-copy";

/** GET /api/kol-market/requests?address=&status= */
export async function GET(request: NextRequest) {
  await ensureDynamicRoute();

  try {
    const address = normalizeAddressParam(searchParam(request, "address"));
    if (!address) {
      return NextResponse.json({ error: "Valid address required" }, { status: 400 });
    }

    const status = searchParam(request, "status") ?? undefined;
    const requests = await listKolRequestsForKol(address, status);
    return NextResponse.json(
      { success: true, data: { requests } },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load requests";
    console.error("[kol-market/requests GET]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/kol-market/requests — create draft or full sponsored request. */
export async function POST(request: NextRequest) {
  await ensureDynamicRoute();

  try {
    const body = (await request.json()) as {
      sponsorAddress?: string;
      kolAddress?: string;
      tokenAddress?: string;
      priceUsd?: number;
      escrowTxHash?: string;
      draft?: boolean;
    };

    const sponsorAddress = normalizeAddressParam(body.sponsorAddress);
    const kolAddress = normalizeAddressParam(body.kolAddress);
    const tokenAddress = normalizeAddressParam(body.tokenAddress);
    const priceUsd = Number(body.priceUsd);

    if (!sponsorAddress || !kolAddress || !tokenAddress) {
      return NextResponse.json(
        { error: "sponsorAddress, kolAddress, and tokenAddress are required" },
        { status: 400 }
      );
    }

    if (sponsorAddress === kolAddress) {
      return NextResponse.json({ error: "Cannot sponsor yourself" }, { status: 400 });
    }

    try {
      await assertSponsorOwnsToken(sponsorAddress, tokenAddress);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : KOL_MARKET_COPY.notTokenCreatorError;
      return NextResponse.json({ error: message }, { status: 403 });
    }

    const kolProfile = await getKolProfileDetail(kolAddress);
    if (!kolProfile?.isActive) {
      return NextResponse.json({ error: "KOL is not accepting requests" }, { status: 404 });
    }

    const effectivePrice =
      Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : kolProfile.minPriceUsd;
    if (effectivePrice < kolProfile.minPriceUsd) {
      return NextResponse.json(
        { error: `Minimum price is $${kolProfile.minPriceUsd}` },
        { status: 400 }
      );
    }

    const { nativeUsd } = await fetchNativeUsdPrice();
    if (!nativeUsd) {
      return NextResponse.json({ error: "Native price unavailable" }, { status: 503 });
    }

    const escrowAmountZug = usdToNativeHuman(effectivePrice, nativeUsd);
    if (escrowAmountZug <= 0) {
      return NextResponse.json({ error: "Invalid escrow amount" }, { status: 400 });
    }

    if (body.draft || !body.escrowTxHash) {
      const draft = await createKolCalloutRequestDraft({
        sponsorAddress,
        kolAddress,
        tokenAddress,
        priceUsd: effectivePrice,
        escrowAmountZug,
      });
      return NextResponse.json({
        success: true,
        data: {
          request: draft,
          escrowAmountZug,
          nativeUsd,
        },
      });
    }

    const txHash = body.escrowTxHash.trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
      return NextResponse.json({ error: "Valid escrowTxHash required" }, { status: 400 });
    }

    const created = await createKolCalloutRequest({
      sponsorAddress,
      kolAddress,
      tokenAddress,
      priceUsd: effectivePrice,
      escrowAmountZug,
      escrowTxHash: txHash,
    });

    return NextResponse.json({ success: true, data: { request: created } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create request";
    console.error("[kol-market/requests POST]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/kol-market/requests — confirm escrow after on-chain lock. */
export async function PATCH(request: NextRequest) {
  await ensureDynamicRoute();

  try {
    const body = (await request.json()) as {
      requestId?: string;
      sponsorAddress?: string;
      escrowTxHash?: string;
    };

    const sponsorAddress = normalizeAddressParam(body.sponsorAddress);
    const requestId = body.requestId?.trim();
    const escrowTxHash = body.escrowTxHash?.trim().toLowerCase();

    if (!sponsorAddress || !requestId || !escrowTxHash) {
      return NextResponse.json(
        { error: "requestId, sponsorAddress, and escrowTxHash are required" },
        { status: 400 }
      );
    }

    if (!/^0x[0-9a-f]{64}$/.test(escrowTxHash)) {
      return NextResponse.json({ error: "Valid escrowTxHash required" }, { status: 400 });
    }

    const requestRow = await confirmKolCalloutRequestEscrow({
      requestId,
      sponsorAddress,
      escrowTxHash,
    });

    return NextResponse.json({ success: true, data: { request: requestRow } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm escrow";
    console.error("[kol-market/requests PATCH]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
