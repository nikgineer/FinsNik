import { useEffect, useRef, useCallback } from "react";

export default function useAutoLogout(
  onLogout: () => void,
  timeout: number = 15 * 60 * 1000,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    localStorage.setItem("lastActivity", Date.now().toString());

    timerRef.current = setTimeout(() => {
      onLogout();
    }, timeout);
  }, [onLogout, timeout]);

  useEffect(() => {
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];

    const handleActivity = () => resetTimer();

    // ✅ If no lastActivity exists, assume user just logged in now
    const lastActivity = localStorage.getItem("lastActivity");
    const now = Date.now();

    if (!lastActivity) {
      localStorage.setItem("lastActivity", now.toString());
    } else {
      const elapsed = now - parseInt(lastActivity, 10);
      if (elapsed > timeout) {
        localStorage.setItem("lastActivity", now.toString());
      }
    }

    events.forEach((event) => window.addEventListener(event, handleActivity));
    resetTimer();

    return () => {
      events.forEach((event) =>
        window.removeEventListener(event, handleActivity),
      );
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer, onLogout, timeout]);
}
