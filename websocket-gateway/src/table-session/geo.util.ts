/** Haversine formula - udaljenost izmedju dvije GPS tacke u metrima. Koristi se za geofencing (modul A.6). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // poluprecnik Zemlje u metrima
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/** Normalizuje IPv4-mapped IPv6 adrese (npr. "::ffff:127.0.0.1" -> "127.0.0.1") radi poredjenja sa `allowed_ip`. */
export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}
