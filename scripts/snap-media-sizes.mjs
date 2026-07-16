/**
 * Snap raw size={N} on TokenAvatar / NativeLogo / BnbLogo / UserAvatar* to corporate steps.
 * Run: node scripts/snap-media-sizes.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "apps/web/src";
const STEPS = [12, 16, 20, 24, 28, 32, 36, 40, 48, 52, 64];

function snap(n) {
  let best = STEPS[0];
  let dist = Math.abs(n - best);
  for (const s of STEPS) {
    const d = Math.abs(n - s);
    if (d < dist) {
      best = s;
      dist = d;
    }
  }
  return best;
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const ROLE_BY_PX = {
  16: "xs",
  20: "sm",
  24: "md",
  28: "lg",
  32: "xl",
  36: "2xl",
  40: "3xl",
  52: "row",
};

const AVATAR_ROLE = {
  16: "xs",
  20: "sm",
  24: "md",
  28: "lg",
  32: "lg",
  36: "xl",
  40: "2xl",
  48: "3xl",
  52: "picker",
  64: "preview",
};

let filesChanged = 0;
let replacements = 0;

for (const file of walk(ROOT)) {
  let src = fs.readFileSync(file, "utf8");
  const original = src;

  // TokenAvatar / NativeLogo / BnbLogo size={N}
  src = src.replace(
    /(\b(?:TokenAvatar|NativeLogo|BnbLogo)\b[\s\S]{0,220}?)\bsize=\{(\d+)\}/g,
    (full, prefix, numStr) => {
      const n = Number(numStr);
      const s = snap(n);
      if (s === n && ROLE_BY_PX[s] && s !== 12 && s !== 48 && s !== 64) {
        const role = ROLE_BY_PX[s];
        if (role && role !== "preview") {
          replacements++;
          return `${prefix}size="${role}"`;
        }
      }
      if (s !== n) {
        replacements++;
        return `${prefix}size={${s}}`;
      }
      return full;
    }
  );

  // UserAvatar / UserAvatarForAddress
  src = src.replace(
    /(\b(?:UserAvatarForAddress|UserAvatar)\b[\s\S]{0,160}?)\bsize=\{(\d+)\}/g,
    (full, prefix, numStr) => {
      const n = Number(numStr);
      const s = snap(n);
      const role = AVATAR_ROLE[s];
      if (role) {
        replacements++;
        return `${prefix}size="${role}"`;
      }
      if (s !== n) {
        replacements++;
        return `${prefix}size={${s}}`;
      }
      return full;
    }
  );

  if (src !== original) {
    fs.writeFileSync(file, src);
    filesChanged++;
  }
}

console.log(JSON.stringify({ filesChanged, replacements }));
