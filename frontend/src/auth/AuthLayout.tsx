import type { ReactNode } from "react";
import { createSafeAreaStyle } from "../utils/safeArea";

interface AuthLayoutProps {
  children: ReactNode;
  contentClassName?: string;
}

export default function AuthLayout({
  children,
  contentClassName,
}: AuthLayoutProps) {
  return (
    <div
      className="auth-shell"
      style={createSafeAreaStyle({
        top: "1rem",
        bottom: "2rem",
        inline: "clamp(1rem, 4vw, 1.6rem)",
      })}
    >
      <div className="auth-shell__glow" aria-hidden="true" />
      <div
        className="auth-shell__glow auth-shell__glow--accent"
        aria-hidden="true"
      />
      <div className="auth-shell__grid" aria-hidden="true" />
      <div className={`auth-shell__content ${contentClassName ?? ""}`}>
        {children}
      </div>
    </div>
  );
}
