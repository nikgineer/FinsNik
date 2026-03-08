import { useEffect, useState } from "react";

export interface ResponsiveRadiusBreakpoint {
  /**
   * CSS media query used to determine whether this breakpoint should apply.
   * It should follow the syntax accepted by `window.matchMedia`.
   */
  query: string;
  /** Radius value to use when the media query matches. */
  value: number;
}

/**
 * Returns a pie chart radius that adapts to viewport changes using media
 * queries so charts can maintain balanced proportions on phones, tablets and
 * desktops. The first matching breakpoint wins; when none match the
 * `defaultRadius` is returned.
 */
export function useResponsivePieRadius(
  defaultRadius: number,
  breakpoints: readonly ResponsiveRadiusBreakpoint[],
): number {
  const [radius, setRadius] = useState(defaultRadius);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const pickRadius = () => {
      const match = breakpoints.find(
        (bp) => window.matchMedia(bp.query).matches,
      );
      setRadius(match ? match.value : defaultRadius);
    };

    pickRadius();

    const listeners = breakpoints.map((bp) => {
      const mediaQuery = window.matchMedia(bp.query);
      const handler = () => pickRadius();
      mediaQuery.addEventListener("change", handler);
      return { mediaQuery, handler };
    });

    window.addEventListener("resize", pickRadius);

    return () => {
      listeners.forEach(({ mediaQuery, handler }) => {
        mediaQuery.removeEventListener("change", handler);
      });
      window.removeEventListener("resize", pickRadius);
    };
  }, [breakpoints, defaultRadius]);

  return radius;
}
