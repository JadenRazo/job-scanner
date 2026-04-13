import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
          variant === "primary"
            ? "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]"
            : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-100",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
