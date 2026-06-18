import { connection } from "next/server";
import { ArenaListClient } from "@/components/arena/ArenaListClient";
import { fetchArenaHomePayload } from "@/lib/arena-server";

/** Dynamic server island — arena SSR payload (use cache inside fetch). */
export async function ArenaHomeServer() {
  await connection();

  let initialPayload = null;
  try {
    initialPayload = await fetchArenaHomePayload({
      filter: "new",
      sortKey: "age",
      sortDir: "desc",
    });
  } catch {
    // Client retries on hydration if SSR fetch fails (e.g. build without DB).
  }

  return <ArenaListClient initialPayload={initialPayload} />;
}
