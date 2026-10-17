/**
 * Code generation: the package is the single source of truth; non-TS
 * consumers get GENERATED artifacts, never hand-maintained copies.
 *
 * - generated/providers.json — canonical data artifact (Python scripts, docs).
 * - generated/providers.go  — drop-in data file for herd (Go cannot import TS).
 * - generated/providers.rs  — drop-in data module for flock (Rust cannot import TS).
 *
 * All are checked in. `bun run build` regenerates them; the sync test
 * regenerates into a temp dir and diffs byte-for-byte, so a stale artifact
 * fails the build. The generated files carry a DO-NOT-EDIT header.
 */
import type { ModelAlias, ProviderDef } from "./types.ts";
export interface CodegenInput {
    defs: ProviderDef[];
    aliases: Record<string, ModelAlias>;
    deadIds: string[];
    /** Free-form provenance, e.g. git sha of the source. */
    provenance?: string;
}
/** Canonical JSON artifact for non-TS consumers (Python research scripts). */
export declare function buildProvidersJson(input: CodegenInput): string;
/**
 * Generated Go data file for herd. Package name and exported symbols are
 * chosen to be a drop-in data replacement for herd's hardcoded tables; herd's
 * own merge/selection LOGIC stays hand-written and reads these tables.
 *
 * The type is CatalogProviderDef (not ProviderDef) — herd's registry.go
 * already declares ProviderDef for the extended 9Router registry.
 */
export declare function buildProvidersGo(input: CodegenInput): string;
/**
 * Generated Rust data module for flock. Rust cannot import TS, so the
 * provider wire data ships as a checked-in generated module — the same
 * pattern as providers.go for herd (Go).
 *
 * The module is DATA ONLY: flock's hand-written providers.rs keeps every
 * operational type and all routing logic, and builds its ProviderDefs from
 * this table merged with flock's local overlay (elo/weight/free-tier/
 * model-map/display-name tuning). The wire fields here (base URLs, key env
 * vars, adapters, seeds) are never hand-edited.
 *
 * Seeds are emitted raw — they may name dead IDs. The consumer filters
 * ROOST_DEAD_IDS, per the catalog contract ("the catalog filters deadIds
 * everywhere (cold start included)").
 */
export declare function buildProvidersRust(input: CodegenInput): string;
/** Emit all artifacts into outDir. Returns the written paths. */
export declare function emitAll(outDir: string, input: CodegenInput): Promise<{
    jsonPath: string;
    goPath: string;
    rustPath: string;
}>;
