import * as React from "react";
import { cn } from "@/lib/utils";
export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full text-left text-sm tabular-nums", className)}
        {...props}
      />
    </div>
  );
}
export function TableHead(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={cn(
        "px-4 py-3 text-xs font-medium text-slate-500",
        props.className,
      )}
    />
  );
}
export function TableCell(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={cn("px-4 py-3", props.className)} />;
}
