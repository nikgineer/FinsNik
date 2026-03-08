// config/index.tsx
import { v4 as uuidv4 } from "uuid";

const config = {
  backendUrl: import.meta.env.VITE_BACKEND_URL || "http://localhost:8000",
  prefetchGrowthData:
    import.meta.env.VITE_PREFETCH_GROWTH?.toLowerCase() !== "false",
};

export function generateUUID(): string {
  return uuidv4();
}

// Random color generator (RGB format)
export function randomColorRgb(): string {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgb(${r}, ${g}, ${b})`;
}

export default config;
export type Currency = "INR" | "USD" | "EUR";
