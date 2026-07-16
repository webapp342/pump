import fs from "node:fs";
import path from "node:path";

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

const LOGO_ROLE = {
  16: "xs",
  20: "sm",
  24: "md",
  28: "lg",
  32: "xl",
  36: "2xl",
  40: "3xl",
  52: "row",
};

let filesChanged = 0;
let reps = 0;

for (const file of walk("apps/web/src")) {
  let src = fs.readFileSync(file, "utf8");
  const original = src;

  src = src.replace(/\bsize=\{(12|14|18|22|26|44)\}/g, (_, n) => {
    reps++;
    const s = snap(Number(n));
    const role = LOGO_ROLE[s];
    return role ? `size="${role}"` : `size={${s}}`;
  });

  // Trade header etc still on size={24}
  src = src.replace(
    /(\b(?:TokenAvatar|NativeLogo|BnbLogo)\b[\s\S]{0,200}?)\bsize=\{(16|20|24|28|32|36|40|52)\}/g,
    (full, prefix, num) => {
      const role = LOGO_ROLE[Number(num)];
      if (!role) return full;
      reps++;
      return `${prefix}size="${role}"`;
    }
  );

  if (src !== original) {
    fs.writeFileSync(file, src);
    filesChanged++;
  }
}

console.log(JSON.stringify({ filesChanged, reps }));
