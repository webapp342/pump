import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

let filesChanged = 0;
let reps = 0;

for (const file of walk("apps/web/src")) {
  let src = fs.readFileSync(file, "utf8");
  const original = src;

  // Logo floor: 12px → xs (16). Keep HourglassIcon etc. at 12.
  src = src.replace(
    /(\b(?:TokenAvatar|NativeLogo|BnbLogo|BnbRewardIcon|BnbAssetChip|TokenSymbolInline|PoolTokenAvatar)\b[\s\S]{0,200}?)\bsize=\{12\}/g,
    (full, prefix) => {
      reps++;
      return `${prefix}size="xs"`;
    }
  );

  src = src.replace(
    /(\bTokenAvatar\b[\s\S]{0,120}?)\bsize=\{48\}/g,
    (full, prefix) => {
      reps++;
      return `${prefix}size="row"`;
    }
  );

  src = src.replace(
    /(\bTokenAvatar\b[\s\S]{0,120}?)\bsize=\{64\}/g,
    (full, prefix) => {
      reps++;
      return `${prefix}size="row"`;
    }
  );

  if (src !== original) {
    fs.writeFileSync(file, src);
    filesChanged++;
  }
}

console.log(JSON.stringify({ filesChanged, reps }));
