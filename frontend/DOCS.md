# Athlos — Guía de módulos (Frontend)

Visión rápida de qué hace cada archivo/carpeta principal y cómo encajan.

## App y autenticación
- `src/App.tsx`: contenedor principal. Alterna entre login y app según autenticación, compone la navegación y el tema.
- `src/presentation/hooks/useAuth.ts`: hook ligero sobre Firebase Auth con `user`, `loading`, `logout` e `isAuthenticated`.

## Infraestructura
- `src/infrastructure/config/firebase.ts`: inicializa Firebase y exporta `auth`, `db` y `storage`.

## Entrenamientos
- `src/presentation/components/workout/WorkoutTracker.tsx`: UI completa de rutinas/sesiones.
  - Buscar ejercicios por músculo/target (ExerciseDB) y cargar lista por defecto si la API falla.
  - Agregar ejercicios manualmente y editar series/reps/descanso antes de crear la sesión.
  - Crear e iniciar sesión para usuario autenticado (Firestore) o modo invitado (local).
  - Ver historial y estadísticas semanales.
- `src/business/services/exerciseAPI.ts`: capa de integración con ExerciseDB y adaptación a `AdaptedExercise` (caché simple y manejo de errores incluido).
- `src/business/services/firestoreService.ts`: servicios de Firestore.
  - `userService`: perfiles de usuario.
  - `foodService`: entradas de alimentos por usuario.
  - `workoutService`: sesiones de entrenamiento (crear/actualizar/consultar/borrar) y métricas.
  - Tipos compartidos: `WorkoutSession`, `Exercise`.

## Alimentación
- `src/presentation/components/food/FoodTracker.tsx`: registrar alimentos por comida, ver totales diarios y semanales.
- `src/business/services/foodDataService.ts`:
  - `foodDatabaseService`: base de datos de alimentos de la app (verificados + añadidos por usuario), búsqueda y conteos.
  - `userFoodService`: CRUD de entradas del usuario y cálculo de totales.
- `src/data/models/VerifiedFoods.ts`: lista curada inicial para poblar la base de datos.

## UI común
- `src/presentation/components/common/UserProfile.tsx`: perfil en barra lateral y logout.
- `src/presentation/components/common/ThemeToggle.tsx`: alternar tema claro/oscuro.
- `src/presentation/components/auth/AuthForm.tsx`: formulario de acceso/registro.
- `src/presentation/components/auth/LoadingScreen.tsx`: pantalla de carga.

## Configuración y build
- `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `tailwind.config.js`, `postcss.config.js`: configuración de build, TypeScript, linting y estilos.
- `src/vite-env.d.ts`: tipos para variables de entorno de Vite (p. ej. `VITE_RAPIDAPI_KEY`).

## Notas
- Entorno: crea `frontend/.env` con `VITE_RAPIDAPI_KEY` para usar ExerciseDB.
- Timestamps de Firestore: los servicios usan `Timestamp.now()`/`fromDate`; la UI convierte a primitivas donde hace falta.
- Robustez: si una dependencia externa falla, la UI intenta un fallback local para no bloquear el flujo (p. ej., lista de ejercicios por defecto).
