// Cost estimation for usage tracking (docs/05 Phase 6). Prices are USD per 1M
// tokens; keep in sync with the provider's pricing. Models not in the table
// (e.g. the `fake` dev drivers) cost 0. Estimates only — the source of truth
// for billing is the provider invoice.
const PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  // Anthropic chat models
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  // OpenAI embedding models (output tokens N/A)
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

// Decimal(10,6) column — round to 6 dp so the stored value is exact.
export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICES_USD_PER_MTOK[model];
  if (!p) return 0;
  const cost = (tokensIn / 1_000_000) * p.input + (tokensOut / 1_000_000) * p.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
