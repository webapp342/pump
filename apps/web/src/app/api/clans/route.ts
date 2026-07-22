import { NextRequest, NextResponse } from "next/server";
import { getLaunchpadPool } from "@/lib/db/launchpad";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export async function GET() {
  const pool = getLaunchpadPool();
  const res = await pool.query<{
    id: string;
    name: string;
    slug: string;
    leader_address: string;
    member_count: string;
  }>(
    `
      SELECT
        c.id::text,
        c.name,
        c.slug,
        c.leader_address,
        COUNT(m.wallet_address)::text AS member_count
      FROM clans c
      LEFT JOIN clan_members m ON m.clan_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 100
    `
  );
  return NextResponse.json({ data: res.rows });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    name?: string;
    leaderAddress?: string;
    description?: string;
  };
  const name = body.name?.trim();
  const leaderAddress = body.leaderAddress?.trim();
  if (!name || !leaderAddress) {
    return NextResponse.json({ error: "name and leaderAddress required" }, { status: 400 });
  }

  const pool = getLaunchpadPool();
  const slug = slugify(name);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const clan = await client.query<{ id: string }>(
      `
        INSERT INTO clans (name, slug, leader_address, description)
        VALUES ($1, $2, $3, $4)
        RETURNING id::text
      `,
      [name, slug, leaderAddress, body.description?.trim() ?? null]
    );
    const clanId = clan.rows[0]!.id;
    await client.query(
      `
        INSERT INTO clan_members (clan_id, wallet_address, role)
        VALUES ($1, $2, 'leader')
      `,
      [clanId, leaderAddress]
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: { id: clanId, slug } }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    const message = err instanceof Error ? err.message : "create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
