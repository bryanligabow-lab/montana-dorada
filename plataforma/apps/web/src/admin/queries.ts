import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Attendance,
  AuditLog,
  Business,
  BusinessUpdateInput,
  Employee,
  EmployeeCreateInput,
  EmployeeUpdateInput,
  PunctualitySummary,
} from '@asis/shared';
import { api } from '../lib/api';

export type AttendanceRow = Attendance & { empNombre: string; empCodigo: string };

function qs(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ── Empleados ──────────────────────────────────────────────────────────────
export function useEmployees(bizId: string) {
  return useQuery({
    queryKey: ['employees', bizId],
    queryFn: () => api<Employee[]>(`/api/admin/businesses/${bizId}/employees`, { auth: true }),
  });
}

export function useCreateEmployee(bizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EmployeeCreateInput) =>
      api<Employee>(`/api/admin/businesses/${bizId}/employees`, { method: 'POST', body, auth: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees', bizId] }),
  });
}

export function useUpdateEmployee(bizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EmployeeUpdateInput }) =>
      api<Employee>(`/api/admin/employees/${id}`, { method: 'PATCH', body: data, auth: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees', bizId] }),
  });
}

export function useDeactivateEmployee(bizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/admin/employees/${id}`, { method: 'DELETE', auth: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees', bizId] }),
  });
}

export function useRegenerateQr(bizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ qrToken: string }>(`/api/admin/employees/${id}/regenerate-qr`, {
        method: 'POST',
        auth: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees', bizId] }),
  });
}

// ── Asistencia / ranking / anomalías / auditoría ────────────────────────────
export function useRanking(bizId: string, params: Record<string, string | undefined>) {
  return useQuery({
    queryKey: ['ranking', bizId, params],
    queryFn: () =>
      api<PunctualitySummary[]>(`/api/admin/businesses/${bizId}/ranking${qs(params)}`, { auth: true }),
  });
}

export function useAttendance(bizId: string, params: Record<string, string | undefined>) {
  return useQuery({
    queryKey: ['attendance', bizId, params],
    queryFn: () =>
      api<AttendanceRow[]>(`/api/admin/businesses/${bizId}/attendance${qs(params)}`, { auth: true }),
  });
}

export function useAnomalies(bizId: string, params: Record<string, string | undefined>) {
  return useQuery({
    queryKey: ['anomalies', bizId, params],
    queryFn: () =>
      api<AttendanceRow[]>(`/api/admin/businesses/${bizId}/anomalies${qs(params)}`, { auth: true }),
  });
}

export function useAudit(bizId: string) {
  return useQuery({
    queryKey: ['audit', bizId],
    queryFn: () => api<AuditLog[]>(`/api/admin/businesses/${bizId}/audit`, { auth: true }),
  });
}

// ── Configuración del negocio ───────────────────────────────────────────────
export function useUpdateBusiness(bizId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BusinessUpdateInput) =>
      api<Business>(`/api/admin/businesses/${bizId}`, { method: 'PATCH', body: data, auth: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
