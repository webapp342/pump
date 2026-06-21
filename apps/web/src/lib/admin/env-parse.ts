export type EnvDocEntry =
  | { kind: "comment"; text: string }
  | { kind: "blank" }
  | { kind: "var"; key: string; value: string };

export type EnvVariableRow = {
  key: string;
  value: string;
  sensitive: boolean;
  scope: "client" | "server";
};

const SENSITIVE_KEY =
  /(?:SECRET|PASSWORD|TOKEN|PRIVATE|API_KEY|CREDENTIAL|_KEY$|DATABASE_URL|REDIS_URL)/i;

export function isSensitiveEnvKey(key: string): boolean {
  if (key.startsWith("NEXT_PUBLIC_")) return false;
  return SENSITIVE_KEY.test(key);
}

export function envVariableScope(key: string): "client" | "server" {
  return key.startsWith("NEXT_PUBLIC_") ? "client" : "server";
}

export function parseEnvDocument(content: string): EnvDocEntry[] {
  const entries: EnvDocEntry[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      entries.push({ kind: "blank" });
      continue;
    }
    if (trimmed.startsWith("#")) {
      entries.push({ kind: "comment", text: line });
      continue;
    }

    let body = trimmed;
    if (body.startsWith("export ")) body = body.slice(7).trim();

    const eq = body.indexOf("=");
    if (eq <= 0) {
      entries.push({ kind: "comment", text: line });
      continue;
    }

    const key = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries.push({ kind: "var", key, value });
  }

  return entries;
}

export function extractEnvVariables(entries: EnvDocEntry[]): EnvVariableRow[] {
  const seen = new Set<string>();
  const rows: EnvVariableRow[] = [];

  for (const entry of entries) {
    if (entry.kind !== "var" || seen.has(entry.key)) continue;
    seen.add(entry.key);
    rows.push({
      key: entry.key,
      value: entry.value,
      sensitive: isSensitiveEnvKey(entry.key),
      scope: envVariableScope(entry.key),
    });
  }

  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

function serializeEnvValue(value: string): string {
  if (value === "") return "";
  if (/^[A-Za-z0-9_./:@%+-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function applyEnvVariables(entries: EnvDocEntry[], variables: EnvVariableRow[]): string {
  const next = new Map(variables.map((row) => [row.key, row.value]));
  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of entries) {
    if (entry.kind === "comment") {
      out.push(entry.text);
      continue;
    }
    if (entry.kind === "blank") {
      out.push("");
      continue;
    }

    if (!next.has(entry.key)) continue;
    if (seen.has(entry.key)) continue;

    seen.add(entry.key);
    out.push(`${entry.key}=${serializeEnvValue(next.get(entry.key) ?? "")}`);
    next.delete(entry.key);
  }

  const appended = [...next.keys()].sort((a, b) => a.localeCompare(b));
  if (appended.length > 0) {
    if (out.length > 0 && out[out.length - 1] !== "") out.push("");
    out.push("# Added via Pump Console");
    for (const key of appended) {
      out.push(`${key}=${serializeEnvValue(next.get(key) ?? "")}`);
    }
  }

  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return `${out.join("\n")}\n`;
}

export function variablesToDocument(variables: EnvVariableRow[]): string {
  const lines = variables
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => `${row.key}=${serializeEnvValue(row.value)}`);
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
