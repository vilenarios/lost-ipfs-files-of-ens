import { readFile, writeFile, mkdir } from "fs/promises";
import fetch from "node-fetch";
import path from "path";

const INPUT_PATH = path.join("data", "ens-ipfs-index.json");
const OUTPUT_PATH = path.join("data", "resolved-status.json");

type Entry = {
  name: string;
  type: "ipfs" | "arweave";
  value: string;
};

type CheckedEntry = Entry & {
  status: "reachable" | "unreachable" | "rateLimited" | "timeout";
  httpStatus?: number;
  checkedAt: string;
  gateway: string;
};

const GATEWAYS = ["https://ipfs.io/ipfs/", "https://cloudflare-ipfs.com/ipfs/"];

const TIMEOUT_MS = 15000;

async function checkIpfs(cid: string): Promise<{
  status: CheckedEntry["status"];
  httpStatus?: number;
  gateway: string;
  summary: string;
}> {
  const gatewayResults: {
    gateway: string;
    status: number | null;
    success: boolean;
  }[] = [];

  for (const gateway of GATEWAYS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(`${gateway}${cid}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      gatewayResults.push({
        gateway,
        status: res.status,
        success: res.status === 200,
      });
    } catch (err: any) {
      gatewayResults.push({
        gateway,
        status: null,
        success: false,
      });
    }
  }

  const numSuccess = gatewayResults.filter((r) => r.success).length;
  const numTimeout = gatewayResults.filter((r) => r.status === null).length;
  const numError = gatewayResults.length - numSuccess - numTimeout;

  const summary = `✅ ${numSuccess}/${GATEWAYS.length} successful, ❌ ${numError}, ⏱ ${numTimeout}`;

  const all429 = gatewayResults.every((r) => r.status === 429);
  const allTimeout = numTimeout === GATEWAYS.length;

  if (numSuccess > 0) {
    const firstSuccess = gatewayResults.find((r) => r.success)!;
    return {
      status: "reachable",
      httpStatus: firstSuccess.status!,
      gateway: firstSuccess.gateway,
      summary,
    };
  }

  if (all429) {
    return {
      status: "rateLimited",
      gateway: gatewayResults.map((r) => `${r.gateway}(429)`).join(", "),
      summary,
    };
  }

  if (allTimeout) {
    return {
      status: "timeout",
      gateway: gatewayResults.map((r) => `${r.gateway}(timeout)`).join(", "),
      summary,
    };
  }

  return {
    status: "unreachable",
    gateway: gatewayResults
      .map((r) => `${r.gateway}(${r.status ?? "timeout"})`)
      .join(", "),
    summary,
  };
}

async function main() {
  await mkdir("data", { recursive: true });
  const raw = await readFile(INPUT_PATH, "utf-8");
  const entries: Entry[] = JSON.parse(raw);

  const output: CheckedEntry[] = [];

  for (const entry of entries) {
    if (entry.type !== "ipfs") continue;

    console.log(`🔍 Checking ${entry.name} (${entry.value})...`);

    const result = await checkIpfs(entry.value);

    const status: CheckedEntry = {
      ...entry,
      status: result.status,
      httpStatus: result.httpStatus,
      checkedAt: new Date().toISOString(),
      gateway: result.gateway,
    };

    output.push(status);

    const emoji =
      result.status === "reachable"
        ? "✅"
        : result.status === "rateLimited"
        ? "🚫"
        : result.status === "timeout"
        ? "⏱"
        : "❌";

    console.log(
      `${emoji} ${entry.name}: ${result.status} (${
        result.httpStatus ?? "timeout"
      }) — ${result.summary}`
    );

    // Write progress immediately after each check
    await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`💾 Wrote ${output.length} entries to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("💥 Script error:", err);
  process.exit(1);
});
