import { describe, expect, test } from "bun:test";
import { ModelCatalog } from "../src/catalog.ts";
import {
  DEAD_MODEL_IDS,
  MODEL_ALIASES,
  PROVIDER_DEFS,
  resolveContext,
} from "../src/data.ts";

describe("reconciled provider data", () => {
  test("provider names are unique", () => {
    const names = PROVIDER_DEFS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("every alias targets a known provider", () => {
    const known = new Set(PROVIDER_DEFS.map((d) => d.name));
    for (const [alias, [provider]] of Object.entries(MODEL_ALIASES)) {
      expect(known.has(provider)).toBe(true);
    }
  });

  test("deadIds has no duplicates", () => {
    expect(new Set(DEAD_MODEL_IDS).size).toBe(DEAD_MODEL_IDS.length);
  });

  test("cold-start serving never includes a dead id", () => {
    const cat = new ModelCatalog(PROVIDER_DEFS, {
      aliases: MODEL_ALIASES,
      deadIds: DEAD_MODEL_IDS,
    });
    for (const d of PROVIDER_DEFS) {
      for (const id of cat.servingModels(d.name)) {
        expect(DEAD_MODEL_IDS).not.toContain(id);
      }
    }
  });

  test("known-dead groq ids are filtered at cold start", () => {
    const cat = new ModelCatalog(PROVIDER_DEFS, {
      aliases: MODEL_ALIASES,
      deadIds: DEAD_MODEL_IDS,
    });
    const ids = cat.servingModels("groq");
    // gpt-oss-120b is dead on groq (filtered); gpt-oss-20b is live (served).
    expect(ids).not.toContain("openai/gpt-oss-120b");
    expect(ids).toContain("openai/gpt-oss-20b");
    expect(ids).not.toContain("llama-3.3-70b-versatile");
    expect(ids).not.toContain("qwen/qwen3-32b");
  });

  test("models url composes without a doubled /v1", () => {
    const cat = new ModelCatalog(PROVIDER_DEFS, {
      aliases: MODEL_ALIASES,
      deadIds: DEAD_MODEL_IDS,
    });
    expect(cat.modelsUrl("openai")).toBe("https://api.openai.com/v1/models");
  });

  test("resolveContext returns the 2M window for the big backbones", () => {
    // The premise: bodybuilder sends a huge job to the BEST model that can
    // HOLD the context. 2M-capable models must resolve to 2,000,000.
    const grok = resolveContext("grok-4.5");
    expect(grok?.contextLength).toBe(2_000_000);
    expect(grok?.modelId).toBe("grok-4.5");
    const grok6 = resolveContext("grok-4.6");
    expect(grok6?.contextLength).toBe(2_000_000);
    // 1M-class nemotrons.
    const ultra = resolveContext("nvidia/nemotron-3-ultra-550b-a55b");
    expect(ultra?.contextLength).toBe(1_048_576);
    const lightning = resolveContext("nvidia/nemotron-3.5-lightning-30b-a3b");
    expect(lightning?.contextLength).toBe(1_048_576);
  });

  test("resolveContext is undefined for an undeclared id", () => {
    // An undeclared id has no declared window: bodybuilder must not assume
    // it can hold a big context (it falls back to smaller-model selection).
    expect(resolveContext("totally/not-a-known-model")).toBeUndefined();
  });
});
