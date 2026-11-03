"use client";
import { FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
export function StaffLogin({ language = "id" }: { language?: "id" | "en" }) {
  const en = language === "en";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const db = supabase();
      const result = await db.auth.signInWithPassword({ email, password });
      if (result.error) throw new Error(en ? "Email or password is incorrect." : "Email atau kata sandi tidak sesuai.");
      const role = await db.rpc("is_staff");
      if (role.error) throw role.error;
      if (!role.data) {
        await db.auth.signOut();
        throw new Error(
          en ? "This account does not have staff access. Please contact your manager." : "Akun ini belum memiliki akses staf. Hubungi pengelola.",
        );
      }
    } catch (e) {
      setError(en ? "Unable to sign in. Check your credentials and staff access, then try again." : e instanceof Error ? e.message : "Tidak dapat masuk.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="mx-auto max-w-md p-8">
      <LockKeyhole className="mb-5 text-brand" />
      <h1 className="text-2xl font-bold">{en ? "Staff sign-in" : "Masuk sebagai staf"}</h1>
      <p className="mb-6 mt-2 text-sm text-slate-500">
        {en ? "Use your Bari Ramen staff account." : "Gunakan akun yang diberikan pengelola Bari Ramen."}
      </p>
      <form onSubmit={login} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm">
            {en ? "Staff email" : "Email staf"}
          </label>
          <input
            className="field"
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm">
            {en ? "Password" : "Kata sandi"}
          </label>
          <input
            className="field"
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button disabled={busy} className="w-full">
          {busy ? (en ? "Signing in…" : "Memeriksa…") : (en ? "Sign in" : "Masuk")}
        </Button>
      </form>
    </Card>
  );
}
