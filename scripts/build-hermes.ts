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

// ── 2026-11-10 live-verified data (nvidia-keydiff.json + vercel-probe.json) ──
// NIM usable on BOTH keys (14), sorted by speed. parse/riva/safety-guard are
// special-purpose (not chat) — flagged but included.
const NIM_USABLE: Array<[model: string, ms: number, kind: "chat" | "special"]> = [
  ["nvidia/nemotron-parse-2.0", 226, "special"],
  ["nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", 227, "chat"],
  ["nvidia/nemotron-3.5-bolt-e4b", 235, "chat"],
  ["poolside/laguna-xs-2.1", 247, "chat"],
  ["meta/llama-guard-4-12b", 265, "special"],
  ["nvidia/nemotron-3.5-lightning-30b-a3b", 277, "chat"],
  ["nvidia/riva-translate-4b-instruct-v2", 293, "special"],
  ["nvidia/nemotron-3.5-super-vl-120b-a12b", 352, "chat"],
  ["mistralai/mistral-large-4-1t-a52b", 355, "chat"],
  ["nvidia/llama-3.1-nemotron-safety-guard-8b-v3", 396, "special"],
  ["minimaxai/minimax-m3.1-flash", 629, "chat"],
  ["nvidia/nemotron-3-ultra-550b-a55b", 944, "chat"],
  ["meta/muse-glimmer-30b", 1187, "chat"],
  ["meta/llama-3.2-90b-vision-instruct", 3583, "chat"],
];

// Vercel-usable chat picks (verified 200, free tier)
const VC_PICKS: Array<[alias: string, model: string, ms: number]> = [
  ["vc-lightning-free", "nvidia/nemotron-3.5-lightning-free", 276],
  ["vc-fast", "morph/morph-v3-fast", 260],
  ["vc-ultra", "nvidia/nemotron-3-ultra-550b-a55b", 360],
  ["vc-glm", "zai/glm-4.7-flash", 325],
  ["vc-r1", "deepseek/deepseek-r1", 411],
  ["vc-oss120", "openai/gpt-oss-120b", 345],
];

// FreeInference (Harvard SEAS) — separate surface, own key
const FI_PICKS: Array<[alias: string, model: string]> = [
  ["nim-free", "glm-5.3-flash"],
  ["nim-coding", "qwen3.6-35b"],
];

function buildAliasBlock(): string {
  const lines: string[] = [];
  lines.push("model_aliases:");
  // nim-* — NIM-direct chat models (the 14; special-purpose get explicit names)
  const chatAliases: Array<[string, string]> = [
    ["nim-lightning", "nvidia/nemotron-3.5-lightning-30b-a3b"],
    ["nim-snap", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"],
    ["nim-bolt", "nvidia/nemotron-3.5-bolt-e4b"],
    ["nim-laguna", "poolside/laguna-xs-2.1"],
    ["nim-supervl", "nvidia/nemotron-3.5-super-vl-120b-a12b"],
    ["nim-mistral4", "mistralai/mistral-large-4-1t-a52b"],
    ["nim-minimax", "minimaxai/minimax-m3.1-flash"],
    ["nim-apex", "nvidia/nemotron-3-ultra-550b-a55b"],
    ["nim-ultra", "nvidia/nemotron-3-ultra-550b-a55b"],
    ["nim-reasoning", "nvidia/nemotron-3-ultra-550b-a55b"],
    ["nim-deep", "nvidia/nemotron-3-ultra-550b-a55b"],
    ["nim-swarm", "nvidia/nemotron-3-ultra-550b-a55b"],
    ["nim-glimmer", "meta/muse-glimmer-30b"],
    ["nim-vision", "meta/llama-3.2-90b-vision-instruct"],
    ["nim-oss20", "openai/gpt-oss-20b"],
  ];
  for (const [alias, model] of chatAliases) {
    lines.push(`  ${alias}:`);
    lines.push(`    model: ${model}`);
    lines.push(`    provider: nvidia`);
  }
  // vc-* — Vercel AI Gateway
  for (const [alias, model] of VC_PICKS) {
    lines.push(`  ${alias}:`);
    lines.push(`    model: ${model}`);
    lines.push(`    provider: ai-gateway`);
    lines.push(`    base_url: https://ai-gateway.vercel.sh/v1`);
    lines.push(`    key_env: AI_GATEWAY_API_KEY`);
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

  // 2. Ensure the 2nd NVIDIA key is in .env (keyEnvAlt pool)
  let envOut = env;
  if (!/^NVIDIA_API_KEY_2=/m.test(envOut)) {
    console.warn("NVIDIA_API_KEY_2 missing from .env — add it for the 2-key pool");
  }

  writeFileSync(HERMES_CONFIG, out);
  console.log(`wrote ${HERMES_CONFIG} (model_aliases block: ${aliasBlock.split("\n").length} lines)`);

  // 3. Report what the default should be
  const defaultModel = "nvidia/nemotron-3.5-lightning-free"; // verified 200 free-tier, 276ms
  const currentDefault = config.match(/^model:\n(?:[ \t]+.*\n)*?[ \t]+default: (.+)$/m)?.[1];
  console.log(`default model: current=${currentDefault} recommended=${defaultModel}`);
  console.log(`NOTE: mimetite does NOT rewrite model.default — hermes owns it. Update manually or via hermes setup model.`);
}

main();