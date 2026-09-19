"use server";

import { redirect } from "next/navigation";
import {
  applyAdminCatalogSync,
} from "@/lib/catalog/admin";

function readMatches(formData: FormData) {
  const matches: Array<{
    providerProductId: string;
    productId: string;
  }> = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("match:")) {
      continue;
    }

    const providerProductId = key.slice("match:".length);
    const productId = String(value).trim();

    if (!providerProductId || !productId) {
      continue;
    }

    matches.push({
      providerProductId,
      productId,
    });
  }

  return matches;
}

export async function applyCatalogAction(formData: FormData) {
  const provider = String(
    formData.get("provider") ?? "",
  ).trim();

  const game = String(
    formData.get("game") ?? "",
  ).trim();

  if (!provider || !game) {
    redirect("/admin/catalog?error=missing_selection");
  }

  try {
    const result = await applyAdminCatalogSync(
      provider,
      game,
      readMatches(formData),
    );

    const params = new URLSearchParams({
      provider,
      game,
      applied: "1",
      created: String(result.created),
      updated: String(result.updated),
      deactivated: String(result.deactivated),
    });

    redirect(`/admin/catalog?${params.toString()}`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Catalog synchronization failed.";

    const params = new URLSearchParams({
      provider,
      game,
      error: message,
    });

    redirect(`/admin/catalog?${params.toString()}`);
  }
}
