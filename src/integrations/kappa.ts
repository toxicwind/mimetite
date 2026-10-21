/**
 * Kappa integration module — first-class provider catalog sync for Kappa.
 *
 * - buildKappaProviderConfig(catalog) — @ai-sdk/openai-compatible config block.
 * - buildKappaInstalledJson(catalog, env) — env-filtered installed slice.
 * - buildKappaModelsDevJson(catalog) — Record<string, Provider> dev format.
 * - syncKappaConfig(options) — write to Kappa config paths.
 */
import type { CodegenInput } from "../codegen.ts";
import {
  buildProvidersKappaJson,
  buildInstalledKappaJson,
  keyEnvsOf,
} from "../codegen.ts";
import type { ProviderDef } from "../types.ts";

export { buildProvidersKappaJson, buildInstalledKappaJson };

/**
 * Build the Kappa provider configuration block.
 * Returns a Record<string, unknown> suitable for kappa.jsonc consumption.
 * Each provider is configured with @ai-sdk/openai-compatible options.
 */
export function buildKappaProviderConfig(catalog: CodegenInput): Record<string, unknown> {
  const providerMap: Record<string, unknown> = {};

  for (const d of catalog.defs) {
    if (d.enabled === false || d.routerLocal || d.name === "herd") {
      continue;
    }
    const models: Record<string, unknown> = {};
    const modelIds =
      d.staticModels && d.staticModels.length > 0
        ? d.staticModels
        : d.seeds && d.seeds.length > 0
          ? d.seeds
          : [];

    for (const id of modelIds) {
      models[id] = {
        name: id,
        limit: {
          context: d.contextLengths?.[id] ?? 128000,
          output: 8192,
        },
      };
    }

    let apiKey = "none";
    if (d.name === "flock") {
      apiKey = "!cat /home/toxic/.tau/flock.key";
    } else if (d.name === "hodos") {
      apiKey = "herd-local";
    } else if (d.auth !== "none" && d.keyEnv) {
      apiKey = `{env:${d.keyEnv}}`;
    }

    const config: Record<string, unknown> = {
      npm: "@ai-sdk/openai-compatible",
      name: d.displayName ?? d.name,
      options: {
        baseURL: d.baseUrl,
        apiKey,
        ...(d.maxConcurrency !== undefined ? { maxConcurrency: d.maxConcurrency } : {}),
      },
      models,
    };

    providerMap[d.name] = config;
  }

  return providerMap;
}

/**
 * Kappa installed JSON — the full catalog structure with installed slice providers.
 * Delegates to codegen's buildInstalledKappaJson for env-filtering.
 */
export function buildKappaInstalledJson(
  catalog: CodegenInput,
  env: Record<string, string | undefined> = {},
): string {
  return buildInstalledKappaJson(catalog, env);
}

/**
 * Kappa ModelsDev JSON — Record<string, Provider> format that
 * Flag.KAPPA_MODELS_PATH expects. Each entry has id, name, env, models.
 */
export function buildKappaModelsDevJson(
  catalog: CodegenInput,
): Record<string, unknown> {
  const providers: Record<string, unknown> = {};

  for (const d of catalog.defs) {
    if (d.enabled === false || d.routerLocal || d.name === "herd") {
      continue;
    }

    const modelIds =
      d.staticModels && d.staticModels.length > 0
        ? d.staticModels
        : d.seeds && d.seeds.length > 0
          ? d.seeds
          : [];

    providers[d.name] = {
      id: d.name,
      name: d.displayName ?? d.name,
      env: d.keyEnv,
      models: modelIds,
      ...(d.maxConcurrency !== undefined ? { maxConcurrency: d.maxConcurrency } : {}),
    };
  }

  return providers;
}

/** Default Kappa config paths. */
const DEFAULT_KAPPA_DESTS = [
  "/home/toxic/.config/kappa/kappa-models.json",
  "/home/toxic/.config/kappa/models.json",
  "/home/toxic/estate/config/kappa/kappa-models.json",
];

/**
 * Write the installed slice to Kappa config paths.
 * Best-effort — the build must not fail if directories don't exist.
 * Returns the array of written paths.
 */
export async function syncKappaConfig(options?: {
  dests?: string[];
  env?: Record<string, string | undefined>;
}): Promise<string[]> {
  const dests = options?.dests ?? DEFAULT_KAPPA_DESTS;
  const env = options?.env ?? {};

  // Load environment from Tau and secrets files if available.
  let resolvedEnv = { ...env };
  try {
    const tauEnv = await Bun.file("/home/toxic/.tau/.env").text();
    for (const line of tauEnv.split("\n")) {
      const s = line.trim();
      if (!s || s.startsWith("#") || !s.includes("=")) continue;
      const eq = s.indexOf("=");
      const k = s.slice(0, eq).trim().replace(/^export\s+/, "");
      const v = s.slice(eq + 1).trim();
      if (k && !resolvedEnv[k]) resolvedEnv[k] = v;
    }
  } catch {
    // best-effort
  }
  try {
    const secrets = await Bun.file("/home/toxic/.secrets").text();
    for (const line of secrets.split("\n")) {
      const s = line.trim();
      if (!s || s.startsWith("#") || !s.includes("=")) continue;
      const eq = s.indexOf("=");
      const k = s.slice(0, eq).trim().replace(/^export\s+/, "");
      const v = s.slice(eq + 1).trim();
      if (k) resolvedEnv[k] = v;
    }
  } catch {
    // best-effort
  }

  // Need the real catalog data.
  const { PROVIDER_DEFS, MODEL_ALIASES, DEAD_MODEL_IDS } = await import(
    "../data.ts"
  );
  const catalog: CodegenInput = {
    defs: PROVIDER_DEFS,
    aliases: MODEL_ALIASES,
    deadIds: DEAD_MODEL_IDS,
    provenance: "@toxicwind/pinax src/data.ts",
  };

  const content = buildKappaInstalledJson(catalog, resolvedEnv);
  const written: string[] = [];

  for (const p of dests) {
    try {
      await Bun.write(p, content);
      written.push(p);
    } catch (e) {
      console.warn("skip Kappa sync to " + p + ": " + (e as Error).message);
    }
  }

  return written;
}
