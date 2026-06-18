/** Client-side local-first read path (Zero-inspired hydration). */
export function useLocalFirstReads(): boolean {
  const value = process.env.NEXT_PUBLIC_LOCAL_FIRST_READS;
  if (value === "false") return false;
  if (value === "true") return true;
  return true;
}
