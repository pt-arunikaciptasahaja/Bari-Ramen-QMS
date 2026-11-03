"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Users } from "lucide-react";

export function PartySizeSelect({ value, disabled, onChange }: {
  value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  useEffect(() => {
    if (!open) return;
    options.current[Number(value) - 1]?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, value]);
  const choose = (number: number) => {
    onChange(String(number)); setOpen(false); trigger.current?.focus();
  };
  return <div ref={root} className="party-size-picker" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} id="guest-pax" type="button" disabled={disabled}
      aria-haspopup="listbox" aria-expanded={open && !disabled} aria-controls={listId}
      className="field party-size-trigger" onClick={() => setOpen(previous => !previous)}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
        if (event.key === "Escape") setOpen(false);
      }}>
      <Users size={20} aria-hidden="true" className="pointer-events-none text-slate-400" />
      <span className="flex-1 text-left"><span className="font-mono text-xl font-semibold tabular-nums">{value}</span> <span className="text-sm text-slate-500">orang</span></span>
      <ChevronDown size={18} aria-hidden="true" className="pointer-events-none text-slate-500" />
    </button>
    {open && !disabled && <div id={listId} role="listbox" aria-label="Jumlah orang" className="party-size-options">
      {Array.from({ length: 12 }, (_, index) => <button key={index} ref={node => { options.current[index] = node; }}
        type="button" role="option" aria-selected={Number(value) === index + 1}
        tabIndex={Number(value) === index + 1 ? 0 : -1}
        onClick={() => choose(index + 1)} onKeyDown={event => {
          const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 1, ArrowLeft: -1 };
          if (event.key in steps) { event.preventDefault(); options.current[(index + steps[event.key] + 12) % 12]?.focus(); }
          if (event.key === "Home" || event.key === "End") { event.preventDefault(); options.current[event.key === "Home" ? 0 : 11]?.focus(); }
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
          if (/^[1-9]$/.test(event.key)) { event.preventDefault(); options.current[Number(event.key)-1]?.focus(); }
        }}><span className="font-mono text-lg font-semibold tabular-nums">{index + 1}</span><span className="text-xs">orang</span></button>)}
    </div>}
  </div>;
}
