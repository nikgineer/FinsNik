import type { CSSProperties } from "react";

export interface SafeAreaOptions {
  /**
   * Additional spacing added above the safe-area inset.
   * Accepts any valid CSS length (e.g. "1rem", "24px").
   */
  top?: string;
  /**
   * Additional spacing added below the safe-area inset.
   */
  bottom?: string;
  /**
   * Horizontal padding applied in addition to the safe-area inset.
   */
  inline?: string;
  /**
   * When true, stage-specific CSS variables are populated so floating
   * controls such as the back/menu buttons stay aligned with the
   * computed safe-area spacing.
   */
  includeStageVars?: boolean;
}

const DEFAULT_INLINE = "clamp(1.25rem, 3vw, 2.75rem)";

export function createSafeAreaStyle({
  top = "1rem",
  bottom = "2.25rem",
  inline = DEFAULT_INLINE,
  includeStageVars = false,
}: SafeAreaOptions = {}): CSSProperties {
  const style: CSSProperties = {
    paddingTop: `calc(env(safe-area-inset-top, 0px) + ${top})`,
    paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottom})`,
    paddingLeft: `calc(env(safe-area-inset-left, 0px) + ${inline})`,
    paddingRight: `calc(env(safe-area-inset-right, 0px) + ${inline})`,
  };

  if (includeStageVars) {
    const styleWithVars = style as CSSProperties & Record<string, string>;
    styleWithVars["--app-stage-top-gap"] = top;
    styleWithVars["--app-stage-bottom-gap"] = bottom;
    styleWithVars["--app-stage-inline-gap"] = inline;
  }

  return style;
}
