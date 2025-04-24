import { GraphQLClient, gql, ClientError } from "graphql-request";
// @ts-ignore
import contentHash from "content-hash";
import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";

const client = new GraphQLClient(
  "https://api.thegraph.com/subgraphs/name/ensdomains/ens"
);

const PAGE_SIZE = 1000;
const DELAY_MS = 1500;
const SAVE_PATH = path.join("data", "ens-ipfs-index.json");

type Result = {
  name: string;
  type: "ipfs" | "arweave";
  value: string;
};

let results: Result[] = [];

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function decodeContentHash(
  contentHashRaw: string
): { type: "ipfs" | "arweave"; value: string } | null {
  try {
    const codec = contentHash.getCodec(contentHashRaw);
    const decoded = contentHash.decode(contentHashRaw);

    if (codec === "ipfs-ns") {
      return { type: "ipfs", value: decoded };
    }

    if (codec === "arweave-ns") {
      return { type: "arweave", value: decoded };
    }

    return null;
  } catch (err) {
    return null;
  }
}

async function fetchDomainsWithContentHash(lastId = "") {
  const query = gql`
    query getDomains($lastId: ID!) {
      domains(first: ${PAGE_SIZE}, where: { id_gt: $lastId }, orderBy: id, orderDirection: asc) {
        id
        name
        resolver {
          contentHash
        }
      }
    }
  `;

  let retries = 0;
  while (true) {
    try {
      const data: any = await client.request(query, { lastId });
      return data.domains;
    } catch (err) {
      if (err instanceof ClientError && err.response?.status === 429) {
        retries++;
        const wait = 1500 * retries;
        console.warn(`⚠️ Rate limited. Retrying in ${wait / 1000}s...`);
        await delay(wait);
        continue;
      } else {
        throw err;
      }
    }
  }
}

async function saveProgress() {
  await mkdir("data", { recursive: true });
  await writeFile(SAVE_PATH, JSON.stringify(results, null, 2));
  console.log(`💾 Progress saved: ${results.length} entries`);
}

async function main() {
  let lastId = "";
  let more = true;

  try {
    const existing = await readFile(SAVE_PATH, "utf-8");
    results = JSON.parse(existing);
    console.log(`🔁 Resuming from previous run (${results.length} entries)...`);
    if (results.length > 0) {
      lastId = results[results.length - 1].name;
    }
  } catch {
    console.log("🆕 Starting fresh");
  }

  while (more) {
    const domains = await fetchDomainsWithContentHash(lastId);

    if (domains.length === 0) {
      more = false;
      break;
    }

    for (const d of domains) {
      lastId = d.id;
      const ch = d?.resolver?.contentHash;
      const decoded = ch ? decodeContentHash(ch) : null;

      if (decoded) {
        const entry: Result = {
          name: d.name,
          type: decoded.type,
          value: decoded.value,
        };

        results.push(entry);
        console.log(
          `Found ${decoded.type.toUpperCase()}: ${d.name} -> ${decoded.value}`
        );
      }
    }

    await saveProgress();
    await delay(DELAY_MS);
  }

  console.log("✅ Done");
}

main().catch(async (err) => {
  console.error("💥 Script crashed:", err);
  await saveProgress();
  process.exit(1);
});
