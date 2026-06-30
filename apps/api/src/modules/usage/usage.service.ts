import type { UsageKind, UsageSummaryResponse } from '@docpilot/shared';
import { withWorkspace } from '../../lib/prisma.js';

// Aggregate the workspace's UsageEvents into per-kind + total tokens and cost.
// Tenant-scoped (groupBy with explicit workspaceId, inside withWorkspace/RLS).
export async function getUsageSummary(workspaceId: string): Promise<UsageSummaryResponse> {
  const grouped = await withWorkspace(workspaceId, (tx) =>
    tx.usageEvent.groupBy({
      by: ['kind'],
      where: { workspaceId },
      _sum: { tokensIn: true, tokensOut: true, costUsd: true },
    }),
  );

  const byKind = grouped.map((g) => ({
    kind: g.kind as UsageKind,
    tokensIn: g._sum.tokensIn ?? 0,
    tokensOut: g._sum.tokensOut ?? 0,
    // costUsd is a Prisma Decimal — coerce to a JSON number.
    costUsd: Number(g._sum.costUsd ?? 0),
  }));

  const totalTokensIn = byKind.reduce((sum, k) => sum + k.tokensIn, 0);
  const totalTokensOut = byKind.reduce((sum, k) => sum + k.tokensOut, 0);
  const totalCostUsd = Number(byKind.reduce((sum, k) => sum + k.costUsd, 0).toFixed(6));

  return { totalCostUsd, totalTokensIn, totalTokensOut, byKind };
}
