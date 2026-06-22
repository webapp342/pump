import { NextResponse } from "next/server";
import { getAirdropIdByCreateTxHash } from "@/lib/db/airdrops";

export async function GET(request: Request) {
  const txHash = new URL(request.url).searchParams.get("txHash")?.trim();
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Invalid txHash" }, { status: 400 });
  }

  try {
    const id = await getAirdropIdByCreateTxHash(txHash);
    if (!id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { id } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
