import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CatalogSyncDecision } from "@/lib/catalog/sync/types";

type ApplyCatalogSyncResult = {
  created: number;
  updated: number;
  deactivated: number;
};

export async function applyCatalogSync(
  decisions: CatalogSyncDecision[],
): Promise<ApplyCatalogSyncResult> {
  const writableDecisions = decisions.filter(
    (decision) =>
      decision.type === "create" ||
      decision.type === "update" ||
      decision.type === "deactivate" ||
      decision.type === "unchanged",
  );

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc(
    "apply_catalog_sync_atomic",
    {
      p_decisions: writableDecisions,
    },
  );

  if (error) {
    console.error("applyCatalogSync failed:", error);
    throw new Error("Unable to apply catalog synchronization.");
  }

  return {
    created: Number(data?.created ?? 0),
    updated: Number(data?.updated ?? 0),
    deactivated: Number(data?.deactivated ?? 0),
  };
}