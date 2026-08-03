import { describe, expect, it } from 'vitest';
import { checkGps, haversineMeters } from './gps';

const NEGOCIO = { lat: -3.677506, lng: -79.687398, radioMetros: 80, gpsRequerido: true };

describe('haversineMeters', () => {
  it('distancia cero en el mismo punto', () => {
    expect(haversineMeters(0, 0, 0, 0)).toBe(0);
  });
  it('1 grado de longitud en el ecuador ≈ 111 km', () => {
    expect(haversineMeters(0, 0, 0, 1)).toBeGreaterThan(110_000);
    expect(haversineMeters(0, 0, 0, 1)).toBeLessThan(112_000);
  });
});

describe('checkGps', () => {
  it('válido dentro del radio', () => {
    const r = checkGps(NEGOCIO, NEGOCIO.lat, NEGOCIO.lng);
    expect(r.valido).toBe(true);
    expect(r.dist).toBe(0);
  });

  it('inválido fuera del radio (~200 m al norte)', () => {
    const lat = NEGOCIO.lat + 200 / 111_320;
    const r = checkGps(NEGOCIO, lat, NEGOCIO.lng);
    expect(r.valido).toBe(false);
    expect(r.dist).toBeGreaterThan(150);
  });

  it('válido a ~50 m', () => {
    const lat = NEGOCIO.lat + 50 / 111_320;
    expect(checkGps(NEGOCIO, lat, NEGOCIO.lng).valido).toBe(true);
  });

  it('sin coordenadas: inválido si el negocio exige GPS', () => {
    expect(checkGps(NEGOCIO).valido).toBe(false);
    expect(checkGps({ ...NEGOCIO, gpsRequerido: false }).valido).toBe(true);
  });

  it('negocio sin ubicación configurada no bloquea', () => {
    expect(checkGps({ lat: null, lng: null, radioMetros: 80, gpsRequerido: true }, 1, 1).valido).toBe(
      true,
    );
  });
});
