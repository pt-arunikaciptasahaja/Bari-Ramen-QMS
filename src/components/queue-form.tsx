"use client";
import { FormEvent, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { enqueue } from "@/lib/api";
import { groupFor, type QueueEntry } from "@/lib/queue";
import { PartySizeSelect } from "./party-size-select";
import { GroupBadge } from "./group-badge";
import { Button } from "./ui/button";
type QueueFormProps =
  | { onAdded: (entry: QueueEntry) => void; onRegister?: never }
  | { onAdded?: never; onRegister: (name: string, pax: number, requestId: string, phone: string) => Promise<void> };
export function QueueForm({
  onAdded,
  onRegister,
}: QueueFormProps) {
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
      if (onRegister) {
        await onRegister(name, Number(pax), requestId.current, phone);
        requestId.current = undefined;
        return;
      }
      const entry = await enqueue(
        name,
        Number(pax),
        "walk-in",
        requestId.current,
        phone,
      );
      onAdded?.(entry);
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
  const phoneField = (
    <div>
        <label htmlFor="guest-phone" className="mb-2 block text-sm font-semibold">
          {onRegister ? 'WhatsApp' : 'Telepon / WhatsApp'} <span className="font-normal text-slate-500">— opsional</span>
        </label>
        <input id="guest-phone" type="tel" inputMode="tel" autoComplete="tel"
          placeholder="08xxxxxxxxxx" maxLength={24} value={phone} disabled={busy}
          onChange={(e) => { changed(); setPhone(e.target.value); }}
          aria-describedby={onRegister ? 'guest-phone-help' : undefined}
          className="field font-mono tabular-nums" />
        {onRegister && <p id="guest-phone-help" className="mt-2 text-xs leading-5 text-slate-500">Hanya untuk menghubungi Anda terkait giliran antrean.</p>}
      </div>
  );
  const paxField = (
    <div>
        <label htmlFor="guest-pax" className="mb-2 block text-sm font-semibold">
          Jumlah orang
        </label>
        <PartySizeSelect value={pax} disabled={busy} onChange={value => { changed(); setPax(value); }} />
        {onRegister && <p className="mt-2 text-xs text-slate-500">Termasuk Anda.</p>}
      </div>
  );
  return (
    <form
      onSubmit={submit}
      className={onRegister ? "grid gap-4" : "grid gap-3 sm:grid-cols-2 sm:items-end xl:grid-cols-[1fr_1fr_190px_auto]"}
    >
      <div>
        <label
          htmlFor="guest-name"
          className="mb-2 block text-sm font-semibold"
        >
          {onRegister ? "Nama" : "Nama tamu"}
        </label>
        <input
          id="guest-name"
          autoComplete="name"
          placeholder={onRegister ? "Nama Anda" : "Masukkan nama tamu"}
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
      {onRegister ? <>{paxField}{phoneField}</> : <>{phoneField}{paxField}</>}
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
        {busy ? "Menyimpan…" : onRegister ? "Ambil nomor antrean" : "Tambah antrean"}
      </Button>
      {!onRegister && <div className="col-span-full flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Kelompok antrean: <GroupBadge group={groupFor(Number(pax))} /></span>
        <span>Minta persetujuan tamu sebelum menghubungi melalui WhatsApp.</span>
      </div>}
      {error && (
        <p role="alert" className={onRegister ? 'text-sm text-red-700' : 'text-sm text-red-700 md:col-span-full'}>
          {error}
        </p>
      )}
    </form>
  );
}
