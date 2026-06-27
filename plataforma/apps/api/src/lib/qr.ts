import { randomBytes } from 'node:crypto';

/** Token secreto que viaja en el QR del empleado. */
export function generateQrToken(): string {
  return randomBytes(24).toString('base64url');
}
