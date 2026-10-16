import { queueGroups, type QueueGroup } from "@/lib/groups";

export function GroupBadge({ group, pax, dark = false }: {
  group: QueueGroup; pax?: number; dark?: boolean;
}) {
  const style = queueGroups[group];
  return (
    <span className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${dark ? style.dark : style.light}`}>
      <span className="font-mono tabular-nums">{group}</span>
      <span>{pax === undefined ? style.label : <><span className="font-mono tabular-nums">{pax}</span> orang</>}</span>
    </span>
  );
}
