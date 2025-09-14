# Athlos — Frontend (React + TypeScript + Vite)

Aplicación frontend para seguimiento de entrenamientos y alimentación. Usa Firebase (Auth/Firestore/Storage) y la API de ExerciseDB (RapidAPI) para sugerir ejercicios.

## Requisitos
- Node.js 18+
- Cuenta y proyecto de Firebase (ya configurado en `src/infrastructure/config/firebase.ts`).
- Clave de RapidAPI para ExerciseDB.

## Configuración de entorno
Crea el archivo `.env` en `frontend/` con:

```
VITE_RAPIDAPI_KEY=tu_clave_de_rapidapi
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

## Estructura principal
- `src/App.tsx`: contenedor principal, navegación y gating por autenticación.
- `src/presentation/components/workout/WorkoutTracker.tsx`: flujo completo de entrenamientos (buscar ejercicios, agregar manualmente, editar series/reps/descanso, crear e iniciar, historial).
- `src/presentation/components/food/FoodTracker.tsx`: registro de comidas y totales diarios/semanales.
- `src/business/services/`: servicios de Firestore (`firestoreService.ts`), ExerciseDB (`exerciseAPI.ts`) y base de datos de alimentos (`foodDataService.ts`).
- `src/infrastructure/config/firebase.ts`: inicialización de Firebase.
- `src/presentation/hooks/useAuth.ts`: estado de autenticación.

Documentación de módulos y archivos: ver `DOCS.md`.

## Notas
- Sin iniciar sesión, puedes crear sesiones locales de entrenamiento (modo invitado).
- Si la API de ejercicios no responde, la app usa una lista por defecto para no bloquear el flujo.
