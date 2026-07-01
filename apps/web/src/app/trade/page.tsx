import { redirect } from "next/navigation";

/** Legacy Trade tab URL — home is now `/`. */
export default function TradePage() {
  redirect("/");
}
