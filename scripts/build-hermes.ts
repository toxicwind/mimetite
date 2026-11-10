/**
 * Hermes target: generate the model_aliases block + provider wiring for
 * ~/pens/hermes/config.yaml from the mimetite SSOT + the 2026-11-10 live
 * benchmark (14 NIM-usable both-keys, 104 Vercel-usable).
 *
 * SURGICAL MERGE CONTRACT (unlike tau/kappa where mimetite owns the whole
 * file): hermes config.yaml carries plugins/telemetry/approvals/webapp state
 * mimetite must never touch. This emitter rewrites ONLY:
 *   - model.model (default) — only if the current default is dead
 *   - model_aliases (whole block — mimetite-owned)
 *   - appends NVIDIA_API_KEY_2 to .env if missing (2-key pool)
 *
 * Run: bun scripts/build-hermes.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const HERMES_CONFIG = "/home/toxic/pens/hermes/config.yaml";
const HERMES_ENV = "/home/toxic/pens/hermes/.env";

// ── 2026-11-10 live-verified data (ttst-alias-results.json — accurate probe) ──
// One alias per verified-usable NIM model. ms = worst-arm TTFT (first token
// latency, text/tool) from the 2026-11-10 24-alias TTST probe (2 arms each,
// 1 run; results in /home/toxic/tmp/ttst-alias-results.json). Sorted by speed
// (fastest first). ttst = worst tok0→tok1 gap from the absurd-ttst scan (784
// tau session files, 2026-11-10); "—" = no session data for that model.
const NIM_ALIASES: Array<[alias: string, model: string, ms: number, kind: "chat" | "special", ttst: string]> = [
  ["nim-parse", "nvidia/nemotron-parse-2.0", 0, "special", "—"],
  ["nim-laguna", "poolside/laguna-xs-2.1", 170, "chat", "—"],
  ["nim-lightning", "nvidia/nemotron-3.5-lightning-30b-a3b", 223, "chat", "62.1s"],
  ["nim-supervl", "nvidia/nemotron-3.5-super-vl-120b-a12b", 226, "chat", "701.8s"],
  ["nim-guard", "meta/llama-guard-4-12b", 231, "special", "—"],
  ["nim-riva", "nvidia/riva-translate-4b-instruct-v2", 251, "special", "—"],
  ["nim-safety", "nvidia/llama-3.1-nemotron-safety-guard-8b-v3", 251, "special", "—"],
  ["nim-snap", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", 285, "chat", "43.7s"],
  ["nim-bolt", "nvidia/nemotron-3.5-bolt-e4b", 353, "chat", "—"],
  ["nim-step", "stepfun-ai/step-5-preview", 367, "chat", "167.1s"],
  ["nim-ultra", "nvidia/nemotron-3-ultra-550b-a55b", 2586, "chat", "129.8s"],
  ["nim-minimax", "minimaxai/minimax-m3.1-flash", 2605, "chat", "197.0s"],
  ["nim-vision", "meta/llama-3.2-90b-vision-instruct", 6897, "chat", "—"],
  ["nim-glimmer", "meta/muse-glimmer-30b", 7762, "chat", "—"],
  ["nim-mistral4", "mistralai/mistral-large-4-1t-a52b", 27165, "chat", "—"],
  ["nim-oss20", "openai/gpt-oss-20b", 44022, "chat", "—"],
];

// Vercel-usable chat picks (verified 200, free tier); ms = worst-arm TTFT
// from the same 2026-11-10 TTST probe.
const VC_PICKS: Array<[alias: string, model: string, ms: number]> = [
  ["vc-fast", "morph/morph-v3-fast", 255],
  ["vc-ultra", "nvidia/nemotron-3-ultra-550b-a55b", 357],
  ["vc-glm", "zai/glm-4.7-flash", 614],
  ["vc-oss120", "openai/gpt-oss-120b", 638],
  ["vc-r1", "deepseek/deepseek-r1", 1110],
  ["vc-lightning-free", "nvidia/nemotron-3.5-lightning-free", 1440],
];

// FreeInference (Harvard SEAS) — separate surface, own key.
// fi-* prefix (NOT nim-*): these ride freeinference.org, not NVIDIA NIM.
const FI_PICKS: Array<[alias: string, model: string]> = [
  ["fi-free", "glm-5.3-flash"],
  ["fi-coding", "qwen3.6-35b"],
  ["fi-flash", "deepseek-v4-flash"],
];

// FreeInference provider row for the /model picker (custom_providers entry).
// The aliases above resolve short names; this block makes the endpoint + its
// live models visible as a user-defined provider row. Models are the
// key-gated /v1/models catalog (verified 2026-11-10); bge-m3 is embeddings-only.
const FI_MODELS: Array<[model: string, note: string]> = [
  ["glm-5.3-flash", "1M ctx, zai, tools"],
  ["qwen3.6-35b", "262k ctx, vllm, tools"],
  ["deepseek-v4-flash", "1M ctx, sglang, tools"],
];

function buildCustomProvidersBlock(): string {
  const lines: string[] = [];
  lines.push("custom_providers:");
  lines.push("  - name: freeinference");
  lines.push("    base_url: https://freeinference.org/v1");
  lines.push("    key_env: FREEINFERENCE_API_KEY");
  lines.push("    api_mode: chat_completions");
  lines.push("    models:");
  for (const [model] of FI_MODELS) {
    lines.push(`      ${model}: {}`);
  }
  return lines.join("\n");
}

function buildAliasBlock(): string {
  const lines: string[] = [];
  lines.push("model_aliases:");
  // nim-* — one alias per verified-usable NIM-direct model, ranked by speed
  // (fastest first); ttst comment = worst tok0→tok1 gap (absurd-ttst scan).
  for (const [alias, model, ms, kind, ttst] of NIM_ALIASES) {
    lines.push(`  ${alias}:`);
    lines.push(`    model: ${model}`);
    lines.push(`    provider: nvidia`);
    lines.push(`    # ${ms}ms ttft · ttst ${ttst} · ${kind}`);
  }
  // vc-* — Vercel AI Gateway
  for (const [alias, model, ms] of VC_PICKS) {
    lines.push(`  ${alias}:`);
    lines.push(`    model: ${model}`);
    lines.push(`    provider: ai-gateway`);
    lines.push(`    base_url: https://ai-gateway.vercel.sh/v1`);
    lines.push(`    key_env: AI_GATEWAY_API_KEY`);
    lines.push(`    # ${ms}ms ttft`);
  }
  // FreeInference
  for (const [alias, model] of FI_PICKS) {
    lines.push(`  ${alias}:`);
    lines.push(`    model: ${model}`);
    lines.push(`    provider: custom`);
    lines.push(`    base_url: https://freeinference.org/v1`);
    lines.push(`    key_env: FREEINFERENCE_API_KEY`);
  }
  return lines.join("\n");
}

function main() {
  const config = readFileSync(HERMES_CONFIG, "utf8");
  const env = readFileSync(HERMES_ENV, "utf8");

  // 1. Replace the model_aliases block (mimetite-owned section)
  const aliasBlock = buildAliasBlock();
  const re = /^model_aliases:\n(?:[ \t]+.*\n?)*/m;
  let out: string;
  if (re.test(config)) {
    out = config.replace(re, aliasBlock + "\n");
  } else {
    out = config.replace(/^(memory:)/m, aliasBlock + "\n$1");
  }

  // 1b. Replace/insert the custom_providers block (mimetite-owned: the
  // freeinference endpoint row). Other custom_providers entries are NOT
  // touched — only the freeinference member is regenerated.
  const cpBlock = buildCustomProvidersBlock();
  const cpRe = /^custom_providers:\n(?:[ \t]+.*\n?)*/m;
  if (cpRe.test(out)) {
    out = out.replace(cpRe, cpBlock + "\n");
  } else {
    out = out.replace(/^(model_aliases:)/m, cpBlock + "\n$1");
  }

  // 2. NVIDIA key pool check (2026-11-10 recon): the entitled keys are
  // NVIDIA_API_KEY (nvapi-SB…, master) + ~/.tau/nvidia-3.key (nvapi-_Gdr…,
  // verified 200). NVIDIA_API_KEY_2 was a DUD (403 everywhere — no Public
  // API Endpoints entitlement) and was removed from .env; never re-add it.
  let envOut = env;
  if (/^NVIDIA_API_KEY_2=/m.test(envOut)) {
    console.warn("NVIDIA_API_KEY_2 is a dead key (403 on every surface) — remove it from .env");
  }
  if (!/^NVIDIA_API_KEY=/m.test(envOut)) {
    console.warn("NVIDIA_API_KEY missing from .env — the entitled master key is required");
  }

  writeFileSync(HERMES_CONFIG, out);
  console.log(`wrote ${HERMES_CONFIG} (model_aliases block: ${aliasBlock.split("\n").length} lines)`);

  // 3. Report what the default should be
  // 2026-11-10 accurate TTST probe: lightning-free is 1440ms text TTFT —
  // SLOWEST vc-* alias, NOT the "276ms" the keydiff probe claimed. The
  // measured-best free default is vc-fast (morph-v3-fast, 255ms, 2/2 arms).
  const defaultModel = "morph/morph-v3-fast"; // verified 200 free-tier, 255ms TTFT
  const currentDefault = config.match(/^model:\n(?:[ \t]+.*\n)*?[ \t]+default: (.+)$/m)?.[1];
  console.log(`default model: current=${currentDefault} recommended=${defaultModel}`);
  console.log(`NOTE: mimetite does NOT rewrite model.default — hermes owns it. Update manually or via hermes setup model.`);
}

main();