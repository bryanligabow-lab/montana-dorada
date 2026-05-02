import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  fetchAsistencia,
  fetchDescansos,
  fetchEmpleados,
  fetchExtras,
  fetchFaltas,
  fetchPagos,
  fetchPuntualidad,
} from './sheets';
import { callApi } from './api';
import type { DescansoTipo, Extra, Falta, Pago } from './types';

const STALE_TIME = 5 * 60_000;

export function useEmpleados() {
  return useQuery({
    queryKey: ['empleados'],
    queryFn: fetchEmpleados,
    staleTime: STALE_TIME,
  });
}

export function usePagos() {
  return useQuery({
    queryKey: ['pagos'],
    queryFn: fetchPagos,
    staleTime: STALE_TIME,
  });
}

export function useDescansos() {
  return useQuery({
    queryKey: ['descansos'],
    queryFn: fetchDescansos,
    staleTime: STALE_TIME,
  });
}

export function useFaltas() {
  return useQuery({
    queryKey: ['faltas'],
    queryFn: fetchFaltas,
    staleTime: STALE_TIME,
  });
}

export function useExtras() {
  return useQuery({
    queryKey: ['extras'],
    queryFn: fetchExtras,
    staleTime: STALE_TIME,
  });
}

export function usePuntualidad() {
  return useQuery({
    queryKey: ['puntualidad'],
    queryFn: fetchPuntualidad,
    staleTime: STALE_TIME,
  });
}

export function useAsistencia() {
  return useQuery({
    queryKey: ['asistencia'],
    queryFn: fetchAsistencia,
    staleTime: STALE_TIME,
  });
}

// ─── Pagos ─────────────────────────────────────────────────────────────────

export interface PagoInput {
  id: string;
  nombre: string;
  fecha: Date;
  hora: string;
  tipoPago: string;
  monto: number;
}

function serializePago(p: PagoInput) {
  return {
    id: p.id,
    nombre: p.nombre,
    fecha: format(p.fecha, 'yyyy-MM-dd'),
    hora: p.hora,
    tipoPago: p.tipoPago,
    monto: p.monto,
  };
}

export function useCreatePago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: PagoInput) => callApi('pago.create', serializePago(p)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pagos'] }),
  });
}
export function useUpdatePago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: PagoInput & { rowId: string }) =>
      callApi('pago.update', { ...serializePago(p), rowId: p.rowId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pagos'] }),
  });
}
export function useDeletePago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rowId: string) => callApi('pago.delete', { rowId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pagos'] }),
  });
}

// ─── Descansos ─────────────────────────────────────────────────────────────

export interface DescansoInput {
  id: string;
  nombre: string;
  fecha: Date;
  tipo: DescansoTipo;
  motivo?: string;
}

function serializeDescanso(d: DescansoInput) {
  return {
    id: d.id,
    nombre: d.nombre,
    fecha: format(d.fecha, 'yyyy-MM-dd'),
    tipo: d.tipo,
    motivo: d.motivo ?? '',
  };
}

export function useCreateDescanso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: DescansoInput) => callApi('descanso.create', serializeDescanso(d)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descansos'] }),
  });
}
export function useUpdateDescanso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: DescansoInput & { rowId: string }) =>
      callApi('descanso.update', { ...serializeDescanso(d), rowId: d.rowId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descansos'] }),
  });
}
export function useDeleteDescanso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rowId: string) => callApi('descanso.delete', { rowId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descansos'] }),
  });
}

// ─── Faltas ────────────────────────────────────────────────────────────────

export interface FaltaInput {
  id: string;
  nombre: string;
  fecha: Date;
  motivo?: string;
  descuento?: number;
}

function serializeFalta(f: FaltaInput) {
  return {
    id: f.id,
    nombre: f.nombre,
    fecha: format(f.fecha, 'yyyy-MM-dd'),
    motivo: f.motivo ?? '',
    descuento: f.descuento ?? 0,
  };
}

export function useCreateFalta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (f: FaltaInput) => callApi('falta.create', serializeFalta(f)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['faltas'] }),
  });
}
export function useUpdateFalta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (f: FaltaInput & { rowId: string }) =>
      callApi('falta.update', { ...serializeFalta(f), rowId: f.rowId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['faltas'] }),
  });
}
export function useDeleteFalta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rowId: string) => callApi('falta.delete', { rowId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['faltas'] }),
  });
}

// ─── Extras ────────────────────────────────────────────────────────────────

export interface ExtraInput {
  id: string;
  nombre: string;
  fecha: Date;
  concepto: string;
  monto: number;
}

function serializeExtra(x: ExtraInput) {
  return {
    id: x.id,
    nombre: x.nombre,
    fecha: format(x.fecha, 'yyyy-MM-dd'),
    concepto: x.concepto,
    monto: x.monto,
  };
}

export function useCreateExtra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (x: ExtraInput) => callApi('extra.create', serializeExtra(x)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extras'] }),
  });
}
export function useUpdateExtra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (x: ExtraInput & { rowId: string }) =>
      callApi('extra.update', { ...serializeExtra(x), rowId: x.rowId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extras'] }),
  });
}
export function useDeleteExtra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rowId: string) => callApi('extra.delete', { rowId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extras'] }),
  });
}

// ─── Notificaciones ────────────────────────────────────────────────────────

export function useSendReminderDescansos() {
  return useMutation({
    mutationFn: (ctx?: Record<string, unknown>) =>
      callApi('notify.reminderDescansos', { context: ctx || {} }),
  });
}

/**
 * Envía el informe semanal por WhatsApp al jefe vía Evolution API.
 * El backend (Apps Script) toma el `message` ya formateado y lo manda al
 * `phone` indicado. La API key de Evolution se lee desde Script Properties.
 */
export function useSendInformeJefe() {
  return useMutation({
    mutationFn: (payload: { message: string; phone: string }) =>
      callApi('notify.informeJefe', payload as unknown as Record<string, unknown>),
  });
}
export function useSendInformeFinal() {
  return useMutation({
    mutationFn: (payload: { period: string; summary: string; detail: unknown }) =>
      callApi('notify.informeFinal', payload as unknown as Record<string, unknown>),
  });
}

export type { Pago, Falta, Extra };
