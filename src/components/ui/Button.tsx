import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "ghost" | "neutral" | "primary" | "danger";

export function Button({
  variant = "neutral",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <button className={`cg-button cg-button-${variant} ${className}`.trim()} type="button" {...props}>
      {children}
    </button>
  );
}
