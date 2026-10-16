"use client";
import { FormEvent, useRef, useState } from "react";
import { ChevronDown, Loader2, Plus, Users } from "lucide-react";
import { enqueue } from "@/lib/api";
import { groupFor, type QueueEntry } from "@/lib/queue";
import { GroupBadge } from "./group-badge";
import { Button } from "./ui/button";
export function QueueForm({
  onAdded,
}: {
  onAdded: (entry: QueueEntry) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
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
        "walk-in",
        requestId.current,
        phone,
      );
      onAdded(entry);
      setName("");
      setPhone("");
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
      className="grid gap-3 sm:grid-cols-2 sm:items-end xl:grid-cols-[1fr_1fr_150px_auto]"
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
        <label htmlFor="guest-phone" className="mb-2 block text-sm font-semibold">
          Telepon / WhatsApp <span className="font-normal text-slate-500">(opsional)</span>
        </label>
        <input id="guest-phone" type="tel" inputMode="tel" autoComplete="tel"
          placeholder="08xxxxxxxxxx" maxLength={24} value={phone} disabled={busy}
          onChange={(e) => { changed(); setPhone(e.target.value); }}
          className="field font-mono tabular-nums" />
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
        className="h-12"
      >
        {busy ? (
          <Loader2 className="animate-spin" size={19} />
        ) : (
          <Plus size={20} />
        )}
        {busy ? "Menyimpan…" : "Tambah Walk-in"}
      </Button>
      <div className="col-span-full flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Grup tamu: <GroupBadge group={groupFor(Number(pax))} /></span>
        <span>Pastikan tamu bersedia dihubungi melalui WhatsApp.</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 md:col-span-full">
          {error}
        </p>
      )}
    </form>
  );
}
