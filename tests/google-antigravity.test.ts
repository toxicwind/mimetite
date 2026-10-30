import { describe, expect, test } from "bun:test";
import { PROVIDER_DEFS } from "../src/data.ts";

const def = PROVIDER_DEFS.find((d) => d.name === "google-antigravity");

describe("google-antigravity catalog entry", () => {
  test("entry exists with the tau-sourced wire shape", () => {
    expect(def).toBeDefined();
    expect(def!.adapter).toBe("static");
    expect(def!.baseUrl).toBe("https://daily-cloudcode-pa.googleapis.com");
    expect(def!.keyEnv).toBe("");
    expect(def!.staticModels).toContain("gemini-3.1-pro");
    expect(def!.staticModels).toContain("claude-sonnet-4-6");
    expect(def!.staticModels).toContain("claude-opus-4-6-thinking");
    expect(def!.staticModels).toContain("gpt-oss-120b");
  });

  test("model list uses live wire ids, not known-dead ids", () => {
    expect(def).toBeDefined();
    // Tau discovery denylists gemini-2.5-pro; gemini-3-pro-image is
    // image-only (tau images/ lane), not a chat model; plain
    // claude-opus-4-6 has no live wire id — only the -thinking twin does.
    expect(def!.staticModels).not.toContain("gemini-2.5-pro");
    expect(def!.staticModels).not.toContain("gemini-3-pro-image");
    expect(def!.staticModels).not.toContain("claude-opus-4-6");
    expect(def!.staticModels).not.toContain("chat_20706");
    expect(def!.staticModels).not.toContain("chat_23310");
  });

  test("Claude wire ids carry the backend 64000 output cap", () => {
    expect(def).toBeDefined();
    expect(def!.modelOverrides?.["claude-sonnet-4-6"]?.maxTokens).toBe(64000);
    expect(def!.modelOverrides?.["claude-opus-4-6-thinking"]?.maxTokens).toBe(64000);
  });
});
