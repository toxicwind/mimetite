/** Derive facts purely from live imports — source of truth, not prose. */
export declare function buildFactsBlock(): string;
/** Replace the FACTS block in README.md in place. Returns true if changed. */
export declare function syncFacts(readmePath?: string): boolean;
