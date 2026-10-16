export const queueGroups = {
  A: {
    label: "1–2 orang",
    light: "bg-sky-100 text-sky-900",
    dark: "bg-sky-950 text-sky-200 ring-1 ring-inset ring-sky-400/30",
    number: "text-sky-200",
    dot: "bg-sky-400",
  },
  B: {
    label: "3–5 orang",
    light: "bg-teal-100 text-teal-900",
    dark: "bg-teal-950 text-teal-200 ring-1 ring-inset ring-teal-400/30",
    number: "text-teal-200",
    dot: "bg-teal-400",
  },
  C: {
    label: "6–12 orang",
    light: "bg-violet-100 text-violet-900",
    dark: "bg-violet-950 text-violet-200 ring-1 ring-inset ring-violet-400/30",
    number: "text-violet-200",
    dot: "bg-violet-400",
  },
} as const;

export type QueueGroup = keyof typeof queueGroups;
export const groupCodes: QueueGroup[] = ["A", "B", "C"];
