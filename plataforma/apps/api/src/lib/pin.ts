import { randomInt } from 'node:crypto';

/** PIN de 4 dígitos (0000-9999) para que el empleado entre a su portal de solo lectura. */
export function generate4DigitPin(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}
