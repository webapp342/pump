import { listAirdrops, type AirdropListItem } from "@/lib/db/airdrops";

export type AirdropsHomePayload = {
  data: AirdropListItem[];
};

/** Server-side airdrops list — SSR home + shared with /api/airdrops. */
export async function fetchAirdropsListPayload(): Promise<AirdropsHomePayload> {
  const data = await listAirdrops();
  return { data };
}
