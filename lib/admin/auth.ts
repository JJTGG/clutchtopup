import "server-only";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("user_roles")
    .select(`
      roles!inner (
        name
      )
    `)
    .eq("user_id", user.id)
    .eq("roles.name", "admin")
    .maybeSingle();

  if (error) {
    console.error("requireAdmin failed:", error);
    throw new Error("Unable to verify administrator access.");
  }

  if (!data) {
    redirect("/account?error=forbidden");
  }

  return user;
}
