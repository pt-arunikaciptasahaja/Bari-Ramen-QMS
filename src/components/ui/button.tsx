import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors duration-75 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-brand text-white hover:bg-slate-800",
        outline: "border border-slate-200 bg-white text-ink hover:bg-slate-100",
        call: "bg-blue-700 text-white hover:bg-blue-800",
        success: "bg-emerald-700 text-white hover:bg-emerald-800",
        destructive:
          "bg-red-50 text-red-800 border border-red-200 hover:bg-red-100",
        ghost: "text-slate-600 hover:bg-slate-100",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof variants> {
  asChild?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(variants({ variant }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
