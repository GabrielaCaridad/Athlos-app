# Athlos — Frontend (React + TypeScript + Vite)

Aplicación frontend para seguimiento de entrenamientos y alimentación. Usa Firebase (Auth/Firestore/Storage) y la API de ExerciseDB (RapidAPI) para sugerir ejercicios.

## Requisitos
- Node.js 18+
- Cuenta y proyecto de Firebase (configurado en `src/3-acceso-datos/firebase/config.ts`).
- Clave de RapidAPI para ExerciseDB.

## Configuración de entorno
Crea el archivo `.env` en `frontend/` con:

```
VITE_RAPIDAPI_KEY=tu_clave_de_rapidapi
VITE_OPENAI_API_KEY=tu_clave_openai   # opcional, el ChatBot tiene fallback
```

## Scripts
- `npm install`: instala dependencias
- `npm run dev`: arranca el entorno de desarrollo
- `npm run build`: build de producción
- `npm run preview`: sirve el build localmente
- `npm run lint`: ejecuta ESLint

## Ejecutar en desarrollo
```powershell
npm install ; npm run dev
```
Abre el enlace que muestra Vite (por defecto http://localhost:5173).

## Estructura principal (resumen)
- `src/1-presentacion/`: componentes UI, pantallas y hooks para la experiencia de usuario.
- `src/2-logica-negocio/servicios/`: capa de servicios (re-exports) usada por la UI.
- `src/3-acceso-datos/`: acceso a datos y adaptadores (FireStore, APIs externas).
- `src/vite-env.d.ts`: tipos para variables de entorno de Vite (p. ej. `VITE_RAPIDAPI_KEY`).

Documentación de módulos y archivos: ver `DOCS.md`.

## Notas
- Sin iniciar sesión, puedes crear sesiones locales de entrenamiento (modo invitado).
- Si la API de ejercicios no responde, la app usa una lista por defecto para no bloquear el flujo.
