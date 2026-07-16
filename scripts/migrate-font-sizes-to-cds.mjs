/**
 * One-shot: map hardcoded font-size rem/px in globals.css → CDS --type-* tokens.
 * Skips icon / chart selectors. Run: node scripts/migrate-font-sizes-to-cds.mjs
 */
import fs from "node:fs";

const path = "apps/web/src/app/globals.css";
const css = fs.readFileSync(path, "utf8");
const map = [
  ["1.75rem", "var(--type-title1-size)"],
  ["1.5rem", "var(--type-title1-size)"],
  ["1.375rem", "var(--type-title3-size)"],
  ["1.25rem", "var(--type-title3-size)"],
  ["1.125rem", "var(--type-headline-size)"],
  ["1.0625rem", "var(--type-headline-size)"],
  ["1rem", "var(--type-body-size)"],
  ["0.95rem", "var(--type-label1-size)"],
  ["0.9375rem", "var(--type-label1-size)"],
  ["0.875rem", "var(--type-label1-size)"],
  ["0.8125rem", "var(--type-legal-size)"],
  ["0.75rem", "var(--type-legal-size)"],
  ["0.6875rem", "var(--type-legal-size)"],
  ["0.625rem", "var(--type-legal-size)"],
  ["0.5625rem", "var(--type-legal-size)"],
  ["0.5rem", "var(--type-legal-size)"],
  ["10px", "var(--type-legal-size)"],
  ["8px", "var(--type-legal-size)"],
];
const skipSel =
  /icon|__icon|material-symbols|fa-|PumpIcon|logogram|wordmark|chart-axis|tv-|lightweight/i;

const lines = css.split(/\r?\n/);
function selectorFor(i) {
  for (let j = i; j >= 0; j--) {
    const t = lines[j].trim();
    if (t.endsWith("{")) {
      return t.slice(0, -1);
    }
    if (t.endsWith("}")) break;
  }
  return "";
}

let changed = 0;
let skipped = 0;
const out = lines.map((line, i) => {
  if (!/font-size:\s*/.test(line)) return line;
  if (line.includes("var(--")) return line;
  if (/font-size:\s*[\d.]+em/.test(line)) return line;
  const sel = selectorFor(i);
  if (skipSel.test(sel)) {
    skipped++;
    return line;
  }
  let next = line;
  for (const [from, to] of map) {
    const re = new RegExp(`font-size:\\s*${from.replace(".", "\\.")}(?!\\w)`);
    if (re.test(next)) {
      next = next.replace(re, `font-size: ${to}`);
      changed++;
      break;
    }
  }
  return next;
});

fs.writeFileSync(path, out.join("\n"));
console.log(JSON.stringify({ changed, skipped, lines: out.length }));
