"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/auth/login?error=missing_fields");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/auth/login?error=invalid_credentials");
  }

  redirect("/account");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || password.length < 8) {
    redirect("/auth/signup?error=invalid_fields");
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    redirect("/auth/signup?error=signup_failed");
  }

  redirect("/auth/login?registered=1");
}

export async function logout() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  redirect("/auth/login");
}