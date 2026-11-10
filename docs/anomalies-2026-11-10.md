# NIM × Vercel Recon Dossier — 2026-11-10

> **Method:** every claim probed live; docs treated as UNSURE until verified.
> **Recon data:** raw JSON artifacts deep-linked below (never duplicated in this doc).
> **Scripts:** `~/pens/hermes/tools/nim-benchmark/*.ts` + `scripts/build-hermes.ts`.

## Recon artifact index (deep links)

| Artifact | Path | Contents |
|---|---|---|
| NIM 3-key probe (84 models) | `~/pens/hermes/tools/nim-benchmark/` + `/home/toxic/tmp/nvidia-probe-3key.json` | full verbose: status/headers/body/ms per model per key |
| NIM keydiff (84 × 2 keys) | `/home/toxic/tmp/nvidia-keydiff.json` | **both keys per model** — the account-scope proof |
| Vercel 505-probe | `/home/toxic/tmp/vercel-probe.json` | full verbose: 505 models × status/ms/body |
| NGC free-endpoint list | `/home/toxic/tmp/ngc-free-endpoints-full.json` | NVIDIA's own `nim_type_preview` marks + deprecations |
| Full audit (all raw lines) | `/home/toxic/tmp/full-audit.txt` | 597 lines, zero truncation |
| NVIDIA ref sweep (17k lines) | `/home/toxic/tmp/nvidia-refs-full.txt` | every spark/dgx/nvcf/nim reference on-box |
| Benchmark summary | `~/pens/hermes/tools/nim-benchmark/BENCHMARK-2026-11-10.md` | merged NIM+Vercel summary |
| PoC results | `/home/toxic/tmp/nim-poc-results.json` | reasoning_budget/glm/deepseek/429 probes |
| Mimetite build | `~/pens/geode/products/mimetite/scripts/build-hermes.ts` | hermes emitter (surgical merge) |
| Hermes plugin | `~/pens/hermes/products/hermes-agent/plugins/model-providers/mimetite/` | mimetite model-provider |

## The core anomaly (account-scope, proven by keydiff)

`/v1/models` lists **84**; keydiff probes **both keys on every model** → **14 usable on both,
69 dead on both, 1 k1-only transient timeout**. Zero key-to-key difference:
`both=14 k1only=1 k2only=0 neither=69`.

Every dead model 404s with the SAME account id: `Function '…' Not found for account 'iuh5eKGaKSnWglC73O7UeZBzNHZ5aP7TLHyJpM-rxWY'`.
→ NVCF function bindings are per-account. Key rotation = 2× RPM, never more models.

**The 14 NIM-usable (both keys, sorted by speed):**
```
nvidia/nemotron-parse-2.0                          226ms  (special: parse)
nvidia/nemotron-3-nano-omni-30b-a3b-reasoning      227ms  (chat)
nvidia/nemotron-3.5-bolt-e4b                       235ms  (chat)
poolside/laguna-xs-2.1                             247ms  (chat)
meta/llama-guard-4-12b                             265ms  (special: safety)
nvidia/nemotron-3.5-lightning-30b-a3b              277ms  (chat)
nvidia/riva-translate-4b-instruct-v2               293ms  (special: translate)
nvidia/nemotron-3.5-super-vl-120b-a12b             352ms  (chat)
mistralai/mistral-large-4-1t-a52b                  355ms  (chat)
nvidia/llama-3.1-nemotron-safety-guard-8b-v3       396ms  (special: safety)
minimaxai/minimax-m3.1-flash                       629ms  (chat)
nvidia/nemotron-3-ultra-550b-a55b                  944ms  (chat)  ← flagship
meta/muse-glimmer-30b                             1187ms  (chat)
meta/llama-3.2-90b-vision-instruct                3583ms  (chat)  ← DEPRECATION 11/15/2026
```

## Layered availability (the three-tier theorem)

1. **Catalog listing** (`/v1/models`) — 84 NIM / 505 Vercel. **Meaningless** (placeholder
   `created` stamps, dead models listed).
2. **NGC free-endpoint mark** (`nim_type_preview` label) — NVIDIA's own free list, 25 endpoints.
   **Still not sufficient** — 20/25 404 for our account.
3. **Live completion probe** — the ONLY truth. 14 NIM + 104 Vercel.

## Vercel surface (505 probed, 104 usable)

- Error mix: 200=104, 400=209 (embedding models), 403=140 (free-tier blocked), 404=52.
- **Zero 429s** on the full 505 parallel probe — Vercel free tier is request-shaped, not RPM.
- "nvidia" ids route via **baseten/deepinfra**, NOT NIM hardware.
- Free-tier picks (verified 200): `nvidia/nemotron-3.5-lightning-free` (276ms),
  `morph/morph-v3-fast` (260ms), `zai/glm-4.7-flash` (325ms), `deepseek/deepseek-r1` (411ms),
  `openai/gpt-oss-120b` (345ms).

## Timeout class (hangs, not 404s)

`z-ai/glm-5.3-flash`, `deepseek-ai/deepseek-v4.1-flash`, `google/diffusiongemma-26b-a4b-it`
HANG on both keys (10s timeout). Known NVIDIA-side (forum: "Chat/completions hangs for
deepseek-v4.1-flash and glm-5.3-flash, GET /v1/models works"). litellm's glm route is
dead-by-hang.

## Reasoning behavior (verified live)

- `reasoning_budget: 128` on ultra-550b → **111 reasoning tokens → "432" correct** (2163ms).
- `reasoning_budget: 4096` → same 111 tokens (budget is a cap, not a target).
- qwen-3-14b burns ALL 128 tokens reasoning at every effort level (minimal→xhigh) — content
  never arrives at small budgets.
- lightning-free needs ~300 max_tokens before content (258 reasoning tokens for "Say OK").
- Per-family params (estate-verified): gpt-oss → `reasoning_effort: medium`;
  nemotron-3 → `reasoning_budget` + `chat_template_kwargs.enable_thinking`;
  glm → `reasoning_effort: low` only.

## 429 behavior

- NIM: 429s below 40 RPM documented (token-weighted). Free tier ~1000 RPD + phone-verified.
- Vercel: 429s at 1.5s pacing; backoff 2/4/8s recovers. ~20 RPM effective.
- nimProxy prior art: `retry-after` header parsing + key rotation + empty-completion guard.

## Stale config rot fixed today

- mimetite nvidia seeds (Oct 3): super-120b seeded (now 404), ultra-550b missing → **fixed**
- keyring `AI_GATEWAY_API_KEY` = `vck_0z6a…` 401-dead → live key `vck_593k…` written to
  `~/.tau/vercel-gateway.key` (+ nvidia.key, nvidia-2.key materialized)
- hermes default was `humansand/ampersand-v0.1` (403 blocked) → `nvidia/nemotron-3.5-lightning-free`
- geode-rig/awareness-manifest: super-120b "proven" (stale)
- data/coding_generated.json nim-* aliases → dead models

## Deprecations (NGC list)

`llama-3.2-90b-vision` → **11/15/2026**; `diffusiongemma-26b-a4b-it` → 11/11/2026;
`cosmos-transfer2_5-2b` → 11/15/2026. Free-list churn: NIM dropped glm-5.3 Oct 28,
added super-vl + step-5-preview Oct 29.

## DGX Spark (the escape hatch)

`spark-17ed` (GB10, aarch64, 128GB unified) benches on-box:
- `nemotron-3-super-120b` Q4_K → **19.94 t/s** (65GiB — fits)
- `gpt-oss-20b` MXFP4 → **83.43 t/s**
- `nemotron-3-nano-4b` Q8_0 → **52.85 t/s**

Dead NIM models (super-120b, glm-5.3-flash) can be served locally on the Spark. NVIDIA Sync
docs + Tailscale integration exist. [OPEN] — route dead NIM ids to Spark?

## Open questions

1. Public API Endpoints scope — why 20 NGC-free endpoints 404 for our account
2. Reasoning-effort ↔ maxRT headroom cross-product sweep (in progress)
3. Should dead NIM ids route to the DGX Spark