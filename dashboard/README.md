# Dashboard Montaña Dorada

Plataforma interna para gestión de personal: asistencia (calendario de descansos), pagos/anticipos, faltas, extras/bonos y nómina. Multi-usuario con permisos por rol.

**Del Sheet se leen solo:**
- `EMPLEADOS` — lista de empleados + sueldos
- `CONF` — usuarios, roles y permisos

**Todo lo demás se registra desde la plataforma y se guarda al Sheet vía Apps Script:**
- `PAGOS` — anticipos y otros pagos
- `DESCANSOS` — calendario de descansos (planificado/vacaciones/permiso/enfermedad)
- `FALTAS` — inasistencias no planificadas
- `EXTRAS` — bonos, horas extra, propinas

## Correr local

```bash
cd dashboard
npm install
npm run dev
```

Se abre en <http://localhost:5173>. Pide usuario + contraseña según los registrados en la tab `CONF` del Sheet.

## Build estático

```bash
npm run build
npm run preview
```

## Gestión de usuarios y permisos

Se hace editando la tab `CONF` del Sheet (columnas `username`, `password`, `permisos`). Ver `apps-script/README.md` → "Preparar el Sheet" para el detalle de formato.

> **Importante:** la contraseña protege la UI, no los datos. El Google Sheet de origen es público con link — cualquiera con la URL del Sheet puede ver los datos sin pasar por esta interfaz. Para seguridad real habría que migrar la fuente a un backend privado.

## Deploy a GitHub Pages

1. Creá un repo en GitHub (ej: `montana-dorada`) y subí el proyecto.
2. Settings → Pages → **Source: GitHub Actions**.
3. Settings → Variables → `VITE_BASE` = `/<nombre-del-repo>/` (ej: `/montana-dorada/`). Si usás dominio personalizado o el repo es `<usuario>.github.io`, usar `/`.
4. Push a `main` con cambios en `dashboard/**` dispara el workflow `.github/workflows/deploy-dashboard.yml`.
5. La URL queda en `https://<usuario>.github.io/<repo>/`.

## Estructura

```
dashboard/
├── src/
│   ├── lib/
│   │   ├── config.ts       ← SHEET_ID, nombres de tabs, PASSWORD_HASH
│   │   ├── sheets.ts       ← cliente gviz, parsers por tab
│   │   ├── analytics.ts    ← días de descanso, días trabajados, KPIs
│   │   ├── queries.ts      ← hooks React Query
│   │   ├── auth.ts         ← hash + session
│   │   ├── format.ts       ← helpers de formato
│   │   └── types.ts        ← tipos compartidos
│   ├── components/
│   │   ├── ui/             ← primitivas (KpiCard, Skeleton, pickers)
│   │   ├── PasswordGate.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── PrivacyBanner.tsx
│   │   └── ErrorView.tsx
│   ├── sections/
│   │   ├── Resumen.tsx
│   │   ├── Asistencia.tsx
│   │   ├── DiasTrabajados.tsx
│   │   ├── Pagos.tsx
│   │   ├── Nomina.tsx
│   │   └── Empleados.tsx
│   ├── App.tsx
│   └── main.tsx
├── public/logo.jpg
├── tailwind.config.ts
├── vite.config.ts
└── package.json
```

## Regla de "día de descanso"

Implementada en `src/lib/analytics.ts`:

> Un día es de descanso si **no existe fila de asistencia para ese empleado en esa fecha**, o si existe pero **no tiene `HORA ENTRADA`** cargada.

Si más adelante querés tratar un `ESTADO = 'FALTA'` como descanso (u otra regla), cambiá solo la función `isRestDay()`.
