"use client";
import { FormEvent, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Loader2, Plus, Users } from "lucide-react";
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
          ? "grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end"
          : "space-y-4"
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
          placeholder="Masukkan nama"
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
        <div
          className={`field flex items-center gap-3 ${busy ? "opacity-60" : ""}`}
        >
          <Users
            aria-hidden="true"
            className="pointer-events-none shrink-0 text-slate-400"
            size={18}
          />
          <select
            id="guest-pax"
            value={pax}
            disabled={busy}
            onChange={(e) => {
              changed();
              setPax(e.target.value);
            }}
            className="min-w-0 flex-1 self-stretch appearance-none bg-transparent p-0 font-mono tabular-nums outline-none"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className="text-sm text-slate-500">
            orang
          </span>
          <ChevronDown
            aria-hidden="true"
            size={16}
            className="pointer-events-none shrink-0 text-slate-500"
          />
        </div>
      </div>
      <Button
        type="submit"
        disabled={busy || !name.trim()}
        className={staff ? "h-12" : "h-12 w-full text-base"}
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
