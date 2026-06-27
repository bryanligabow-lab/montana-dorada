# Plataforma de Asistencia (multi-negocio)

Sistema profesional de asistencia y puntualidad que reemplaza el flujo en Google
Apps Script + Sheets. Administra **varios negocios** en un solo panel, con
marcación rápida por **QR + GPS** y auditoría real.

- **PWA de marcación** (`/marcar/:token`): el empleado escanea su QR, valida GPS y
  marca entrada/salida en menos de un segundo.
- **Panel admin** (`/admin`): login, selector de negocio, ranking de puntualidad,
  asistencia diaria/mensual, empleados con generación de QR, auditoría y
  configuración por negocio.
- **API** (Node + Fastify + Drizzle sobre PostgreSQL): toda la lógica de tardanzas,
  medallas y multas (el pozo del día va a quien llega más temprano), GPS validado
  en el servidor y bitácora de cambios.

## Estructura

```
plataforma/
├─ apps/
│  ├─ api/        # Fastify + Drizzle (PostgreSQL / PGlite en dev)
│  └─ web/        # React + Vite + Tailwind (PWA de marcación + panel)
├─ packages/
│  └─ shared/     # tipos, contrato y constantes compartidas
└─ docker-compose.yml
```

## Desarrollo local (sin Docker)

Requiere Node ≥ 20 y `corepack` (incluido con Node). No necesita Postgres:
en desarrollo se usa **PGlite** (Postgres embebido) en `apps/api/.pglite`.

```bash
corepack pnpm install
corepack pnpm db:push          # crea las tablas
corepack pnpm db:seed          # crea los 2 negocios + usuario OWNER + empleados de ejemplo
corepack pnpm dev              # levanta API (:8080) y web (:5173) en paralelo
```

El seed imprime el usuario OWNER (por defecto `owner@asis.local` / `cambia1234`,
configurable con `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`) y los tokens QR de los
empleados de ejemplo.

- Panel: <http://localhost:5173/admin>
- Marcación: `http://localhost:5173/marcar/<qr_token>`

### Tests y tipos

```bash
corepack pnpm test         # vitest (lógica core + integración con PGlite)
corepack pnpm typecheck
```

## Variables de entorno

Ver `.env.example`. Las clave:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Postgres de producción. Si está vacío, usa PGlite (dev). |
| `JWT_SECRET` | Firma de tokens del panel. Cambiar en producción. |
| `SMTP_*`, `MAIL_FROM`, `REPORT_EMAILS` | Reportes por correo (cron diario/semanal/mensual). |
| `EVOLUTION_*` | WhatsApp opcional (Evolution API). |
| `VITE_API_URL` | URL pública de la API (la web la hornea en build). |

## Despliegue en EasyPanel

Crear **3 servicios** en el mismo proyecto de EasyPanel, todos apuntando a este
repositorio de GitHub. El _build context_ es la carpeta `plataforma/`.

### 1. PostgreSQL
- EasyPanel → **+ Service → Postgres**. Anota el usuario, contraseña y nombre de BD.
- La URL interna queda como `postgres://USER:PASS@<nombre-servicio>:5432/DB`.

### 2. API (`@asis/api`)
- **+ Service → App**, fuente: este repo.
- **Build**: Dockerfile → `apps/api/Dockerfile`; build context/path: `plataforma`.
- **Environment**:
  - `DATABASE_URL` = la URL interna del Postgres del paso 1
  - `JWT_SECRET` = un secreto largo y aleatorio
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (opcional, reportes)
  - `EVOLUTION_URL`, `EVOLUTION_KEY`, `EVOLUTION_INSTANCE` (opcional, WhatsApp)
- **Puerto**: 8080. Asigna un dominio, p. ej. `api.tudominio.com`.
- Las migraciones se aplican solas al arrancar.

Tras el primer deploy, ejecuta una vez el seed (consola del servicio o localmente
apuntando `DATABASE_URL` al Postgres):

```bash
corepack pnpm --filter @asis/api db:seed
```

### 3. Web (`@asis/web`)
- **+ Service → App**, fuente: este repo.
- **Build**: Dockerfile → `apps/web/Dockerfile`; build context/path: `plataforma`.
- **Build arg**: `VITE_API_URL` = `https://api.tudominio.com` (la del paso 2).
- **Puerto**: 80. Asigna el dominio principal, p. ej. `asistencia.tudominio.com`.

> Cada `git push` a la rama configurada dispara un redeploy automático.

## Migrar empleados desde un Sheet existente

```bash
MIGRATE_SHEET_ID=<id-del-sheet> MIGRATE_BUSINESS_SLUG=ginitafruits \
  corepack pnpm --filter @asis/api migrate:sheets
```

Lee la pestaña `EMPLEADOS` (columnas `ID, NOMBRE, SUELDO, ESTADO, SUELDO_FDS,
DEUDA_INICIAL`) y crea los empleados con QR nuevos.

## Generar los QR

En el panel → **Empleados → QR** se muestra el código de cada empleado
(`<dominio>/marcar/<token>`) listo para imprimir y pegar en el local.
