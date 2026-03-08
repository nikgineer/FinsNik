export function buildAuthHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const token = localStorage.getItem("token")?.trim();

  return token
    ? {
        Authorization: `Bearer ${token}`,
        ...extra,
      }
    : { ...extra };
}
