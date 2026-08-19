import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm",
        secondary:
          "bg-white text-ink border border-line-strong hover:bg-brand-50 hover:border-brand-200",
        ghost: "text-ink-soft hover:bg-brand-50 hover:text-brand-700",
        danger: "bg-danger-500 text-white hover:bg-danger-700",
        accent: "bg-accent-500 text-white hover:bg-accent-700 shadow-sm",
        link: "text-brand-600 hover:text-brand-800 underline underline-offset-4",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

type BaseProps = VariantProps<typeof buttonVariants> & { className?: string };

export type ButtonProps = BaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  className,
  variant,
  size,
  block,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}

export type ButtonLinkProps = BaseProps &
  React.ComponentProps<typeof Link>;

export function ButtonLink({
  className,
  variant,
  size,
  block,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
