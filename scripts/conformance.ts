/**
 * conformance.ts — the OBSERVED half of the routes contract.
 *
 * Probes every route declared in generated/routes-contract.json against
 * live reality (health front door + chat probe on the first declared seed,
 * stream and non-stream) and fails on drift: a route the catalog declares
 * but that answers otherwise-than-declared is a contract violation — the
 * estate/fast incident class (declared≠observed, sticky sessions burned
 * retries on a lying upstream).
 *
 * Key resolution: keyEnv from the environment, or a `!cat <file>` style
 * fallback via --key-file provider=path. Run: `bun run conformance`.
 */
import { basename } from "node:path";

interface Route {
  provider: string;
  modelProvider: string | null;
  baseUrl: string;
  auth: string;
  keyEnv: string;
  seeds: string[];
  healthPath: string;
  healthOk: number[];
  probePath: string;
}
interface Contract {
  schema: string;
  routes: Route[];
  directives: { lanes: string[] };
}

const REDACT = (s: string) => (s ? `...${s.slice(-4)}` : "(none)");

async function resolveKey(route: Route): Promise<string | null> {
  if (route.auth === "none") return null;
  if (process.env[route.keyEnv]) return process.env[route.keyEnv];
  const argPrefix = `--key-file:${route.provider}`;
  const arg = process.argv.find((a) => a.startsWith(argPrefix + "="));
  if (arg) {
    const file = arg.slice(argPrefix.length + 1).replace(/^!cat /, "");
    return (await Bun.file(file).text()).trim();
  }
  return null;
}

async function probe(route: Route) {
  const key = await Promise.resolve(resolveKey(route));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (key) headers.Authorization = `Bearer ${key}`;
  const out: Record<string, string> = {};

  const url = (p: string) => route.baseUrl.replace(/\/$/, "") + p;

  try {
    const hr = await fetch(url(route.healthPath), { headers });
    out.health =
      hr.status === 200
        ? "open"
        : route.healthOk.includes(hr.status)
          ? `alive(${hr.status})`
          : `DRIFT(${hr.status})`;
  } catch (e: unknown) {
    out.health = "DEAD(" + String((e as Error).message).slice(0, 30) + ")";
    return out;
  }

  const seed = route.seeds[0];
  if (!seed) {
    out.chat = "no-seed";
    return out;
  }
  if (!key) {
    // Auth wall with no credential in scope: the route is alive but the
    // chat contract is unverifiable here — that is NOT drift.
    out.chat = "no-key (route alive, contract unverifiable)";
    return out;
  }
  for (const stream of [false, true]) {
    const label = stream ? "chat-stream" : "chat";
    try {
      // One retry with backoff on 429/5xx: probe bursts throttle honestly
      // (moonshot/cohere/freeinference answered 429 within one burst) and
      // transient 500s must not masquerade as contract drift.
      let status = 0;
      let txt = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch(url(route.probePath), {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: seed,
            stream,
            messages: [{ role: "user", content: "say OK" }],
            max_tokens: 2000,
          }),
        });
        txt = await r.text();
        status = r.status;
        if (status !== 429 && status < 500) break;
        await Bun.sleep(1500);
      }
      out[label] =
        status === 200
          ? "OK"
          : status === 404
            ? `UNENTITLED(404: seed '${seed}' rejected — catalog lies)`
            : `FAIL(${status})`;
    } catch (e: unknown) {
      out[label] = "ERR(" + String((e as Error).message).slice(0, 30) + ")";
    }
  }
  return out;
}

const contractPath =
  process.argv
    .find((a) => a.startsWith("--contract="))
    ?.slice("--contract=".length) ??
  new URL("../generated/routes-contract.json", import.meta.url).pathname;
const contract: Contract = await Bun.file(contractPath).json();
if (contract.schema !== "routes-contract/1") {
  console.error(`unknown contract schema: ${contract.schema}`);
  process.exit(2);
}

console.log(
  `routes-contract conformance — ${contract.routes.length} declared routes\n`,
);
let drift = 0;
for (const route of contract.routes) {
  const res = await probe(route);
  const bad = Object.values(res).some((v) =>
    /^(DRIFT|DEAD|FAIL|ERR|UNENTITLED)/.test(v),
  );
  if (bad) drift++;
  const name = route.modelProvider
    ? `${route.provider}.${route.modelProvider}`
    : route.provider;
  console.log(
    `${bad ? "✗" : "✓"} ${name} [key ${route.keyEnv}=${REDACT(process.env[route.keyEnv] ?? "")}]`,
  );
  for (const [k, v] of Object.entries(res)) console.log(`    ${k}: ${v}`);
}
console.log(
  `\n${drift === 0 ? "ALL DECLARED ROUTES CONFORM" : `${drift} ROUTE(S) IN DRIFT with the declared contract`}`,
);
process.exit(drift === 0 ? 0 : 1);
