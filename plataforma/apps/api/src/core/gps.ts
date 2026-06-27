// Verificación de ubicación en el servidor (no se puede falsear desde el cliente).

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GpsCheck {
  provided: boolean;
  dist: number | null;
  valido: boolean;
}

export function checkGps(
  b: { lat: number | null; lng: number | null; radioMetros: number; gpsRequerido: boolean },
  lat?: number,
  lng?: number,
): GpsCheck {
  if (lat == null || lng == null) {
    // Sin coordenadas: válido solo si el negocio no exige GPS.
    return { provided: false, dist: null, valido: !b.gpsRequerido };
  }
  if (b.lat == null || b.lng == null) {
    // El negocio no tiene ubicación configurada: no podemos validar distancia.
    return { provided: true, dist: null, valido: true };
  }
  const dist = Math.round(haversineMeters(b.lat, b.lng, lat, lng));
  return { provided: true, dist, valido: dist <= b.radioMetros };
}
