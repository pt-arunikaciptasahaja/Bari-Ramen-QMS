"use client";
import { FormEvent, useRef, useState } from "react";
import { ArrowRight, Loader2, Plus, Users } from "lucide-react";
import { enqueue } from "@/lib/api";
import { type QueueEntry } from "@/lib/queue";
import { Button } from "./ui/button";
export function QueueForm({
  staff = false,
  onAdded,
}: {
  staff?: boolean;
  onAdded: (entry: QueueEntry) => void;
}) {
  const [name, setName] = useState("");
  const [pax, setPax] = useState("2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | undefined>(undefined);
  const submitting = useRef(false);
  const changed = () => {
    requestId.current = undefined;
    setError("");
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      requestId.current ??= crypto.randomUUID();
      const entry = await enqueue(
        name,
        Number(pax),
        staff ? "walk-in" : "online",
        requestId.current,
      );
      onAdded(entry);
      setName("");
      requestId.current = undefined;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Antrean belum tersimpan. Silakan coba lagi.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className={
        staff
          ? "grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end"
          : "space-y-5"
      }
    >
      <div>
        <label
          htmlFor="guest-name"
          className="mb-2 block text-sm font-semibold"
        >
          Nama Tamu
        </label>
        <input
          id="guest-name"
          autoComplete="name"
          placeholder="Nama panggilan Anda"
          maxLength={60}
          required
          value={name}
          disabled={busy}
          onChange={(e) => {
            changed();
            setName(e.target.value);
          }}
          className="field"
        />
      </div>
      <div>
        <label htmlFor="guest-pax" className="mb-2 block text-sm font-semibold">
          Jumlah Orang
        </label>
        <div className="relative">
          <Users
            className="pointer-events-none absolute left-4 top-4 text-stone-400"
            size={19}
          />
          <select
            id="guest-pax"
            value={pax}
            disabled={busy}
            onChange={(e) => {
              changed();
              setPax(e.target.value);
            }}
            className="field pl-11"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1} orang
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button
        type="submit"
        disabled={busy || !name.trim()}
        className={staff ? "h-[54px]" : "h-14 w-full text-base"}
      >
        {busy ? (
          <Loader2 className="animate-spin" size={19} />
        ) : staff ? (
          <Plus size={20} />
        ) : null}
        {busy ? "Menyimpan…" : staff ? "Tambah Walk-in" : "Ambil Antrean"}
        {!staff && !busy && <ArrowRight size={19} />}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700 md:col-span-full">
          {error}
        </p>
      )}
    </form>
  );
}
