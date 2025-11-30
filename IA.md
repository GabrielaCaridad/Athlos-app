# Auditoría técnica Athlos

## 1. Arquitectura del proyecto
- **Capas y roles**
  - `src/1-presentacion`: vistas y UI (pantallas de Dashboard, Alimentación, Correlaciones, Entrenamientos, Configuración), componentes comunes (toasts, perfil, toggles) y hooks de presentación (`usePersonalInsights`, `useUserData`, `useChat`, etc.). Enrutamiento principal en `App.tsx`, que protege rutas por autenticación, controla tema y renderiza ChatBot global.【F:app/src/1-presentacion/App.tsx†L2-L168】
  - `src/2-logica-negocio`: hooks de contexto (`AuthProvider`, `useAuth`) y servicios de dominio (tracking de alimentos, workouts, correlaciones, servicios externos). Ej.: `correlationInsightsService` orquesta cálculos y llamadas a Functions; `userDataService` publica suscripciones unificadas.
  - `src/3-acceso-datos`: adaptadores a Firebase (`config.ts`, `firestoreService.ts`, `foodDataService.ts`) y APIs externas (`exerciseAPI.ts`, `usdaFoodAPI.ts`). Define modelos y funciones CRUD contra Firestore y catálogos externos.
  - `functions/src`: Cloud Functions v2 (callables `chat`, `generateInsights`; scheduler/callable `analisisSemanal`). Export central en `functions/src/index.ts` con `setGlobalOptions` para límites globales.【F:functions/src/index.ts†L1-L23】
- **Pantallas y navegación**
  - Rutas declaradas en `App.tsx`: `/dashboard` (Dashboard), `/food` (FoodTracker), `/correlations` (CorrelationsDashboard), `/workouts` (WorkoutTracker), `/config` (ConfiguracionPage); fallback 404 sencillo.【F:app/src/1-presentacion/App.tsx†L33-L165】
  - La UI lateral y la cabecera dependen de `useLocation` para título dinámico; ChatBot se renderiza siempre que haya usuario autenticado.【F:app/src/1-presentacion/App.tsx†L22-L168】
- **Flujo general detectado en código**
  - Autenticación Firebase Auth mediante `AuthProvider`/`useAuth`, bloqueando UI hasta resolver `loading`.【F:app/src/2-logica-negocio/hooks/AuthProvider.tsx†L1-L40】【F:app/src/1-presentacion/App.tsx†L22-L32】
  - Carga de perfil y datos recientes vía `userService` y `useUserData` (suscripciones a foods/workouts) en Dashboard.【F:app/src/1-presentacion/componentes/dashboard/Dashboard.tsx†L12-L122】
  - Tracking de alimentos en `FoodTracker` (usa `foodDataService` y `usdaFoodAPI`) y de entrenamientos en `WorkoutTracker` (usa `workoutService`, `exerciseAPI`).【F:app/src/1-presentacion/componentes/alimentacion/FoodTracker.tsx†L1-L16】【F:app/src/1-presentacion/componentes/entrenamiento/WorkoutTracker.tsx†L2-L47】
  - Correlaciones/insights: `usePersonalInsights` instancia `CorrelationInsightsService` para recuperar cache y recalcular; `CorrelationsDashboard` produce gráficos y persiste insights derivados.【F:app/src/1-presentacion/hooks/usePersonalInsights.ts†L1-L72】【F:app/src/1-presentacion/componentes/correlaciones/CorrelationsDashboard.tsx†L540-L723】
  - Chat: `useChat` llama a Function `chat` y se consume en `ChatBot` para conversación contextual con insights y atajos.【F:app/src/1-presentacion/hooks/useChat.ts†L1-L116】【F:app/src/1-presentacion/componentes/chatbot/ChatBot.tsx†L1-L92】

## 2. Código sin uso y elementos candidatos a eliminación
- Archivo: `src/2-logica-negocio/servicios/metricsService.ts`
  - Elemento: módulo completo (helpers `buildCorrelationData`, `hasMinimumDataForAnalysis`).
  - Evidencia de no uso: no hay importaciones fuera del propio archivo (`rg metricsService` solo devuelve esta ruta).
  - Riesgo al eliminar: medio (lógica de correlaciones podría ser útil para análisis; revisar antes de borrar o mover a legacy).
- Archivo: `src/2-logica-negocio/servicios/correlationInsightsService.ts`
  - Elemento: export por defecto `correlationInsightsService` instanciado al final del archivo.
  - Evidencia de no uso: la app crea instancias nuevas dentro de `usePersonalInsights` en lugar de reutilizar la instancia exportada; no se encontraron importaciones de `correlationInsightsService` (solo del tipo `PersonalInsight`).【F:app/src/1-presentacion/hooks/usePersonalInsights.ts†L19-L68】【F:app/src/2-logica-negocio/servicios/correlationInsightsService.ts†L785-L785】
  - Riesgo al eliminar: bajo/medio (instancia sin referencias; mantener como legacy o eliminar para evitar confusión).

## 3. Código crítico y dependencias centrales
- **Enrutador principal**: `src/1-presentacion/App.tsx` controla autenticación, layout, rutas y tema. Cualquier cambio afecta a toda la navegación y montaje de ChatBot.【F:app/src/1-presentacion/App.tsx†L22-L168】
- **Contexto de autenticación**: `AuthProvider`/`AuthContext` manejan sesión de Firebase, logout y actualización de perfil; `useAuth` lanza error si se usa fuera del provider. Es la base para proteger vistas y obtener `uid` en servicios.【F:app/src/2-logica-negocio/hooks/AuthProvider.tsx†L1-L43】【F:app/src/2-logica-negocio/hooks/useAuth.ts†L1-L14】
- **Firebase config**: `src/3-acceso-datos/firebase/config.ts` inicializa app, auth, firestore, storage y functions con validación de variables. Es punto único de configuración; no tocar sin pruebas de entorno.【F:app/src/3-acceso-datos/firebase/config.ts†L1-L31】
- **Acceso a datos**: `firestoreService.ts` centraliza CRUD de perfiles, workouts, plantillas y cálculos (BMR/TDEE/macros). Varias pantallas dependen de estos modelos para consistencia de fechas y reglas de negocio.【F:app/src/3-acceso-datos/firebase/firestoreService.ts†L1-L120】
- **Hooks de datos**: `useUserData` (suscripción foods+workouts) y `usePersonalInsights` (cache + recomputación) alimentan Dashboard, ChatBot y CorrelationsDashboard; no se deben romper sin cobertura de tests.【F:app/src/1-presentacion/hooks/useUserData.ts†L1-L21】【F:app/src/1-presentacion/hooks/usePersonalInsights.ts†L15-L69】
- **Chat**: `useChat` encapsula llamada a Function `chat`, maneja rate limiting y errores; `ChatBot` consume directamente. Cambios en payload/contract requieren coordinar con backend Functions.【F:app/src/1-presentacion/hooks/useChat.ts†L1-L116】【F:app/src/1-presentacion/componentes/chatbot/ChatBot.tsx†L35-L92】
- **Servicios de correlaciones**: `CorrelationInsightsService` agrupa datos de foods/workouts, genera insights locales y llama a Function `generateInsights`. Es crítico para CorrelationsDashboard y para enriquecer el chat con insights personales.【F:app/src/1-presentacion/hooks/usePersonalInsights.ts†L15-L68】【F:app/src/2-logica-negocio/servicios/correlationInsightsService.ts†L105-L139】

## 4. Módulo de correlaciones e insights personales
- **Servicios y hooks**
  - `CorrelationInsightsService`: calcula correlaciones (Pearson/Spearman) y genera insights adicionales; llama a `generateInsights` (Function) para enriquecer resultados IA.【F:app/src/2-logica-negocio/servicios/correlationInsightsService.ts†L105-L192】【F:app/src/2-logica-negocio/servicios/correlationInsightsService.ts†L682-L725】
  - `usePersonalInsights`: carga cache desde Firestore y fuerza recalculo para ventanas de 14 días; se usa en Dashboard, ChatBot y CorrelationsDashboard.【F:app/src/1-presentacion/hooks/usePersonalInsights.ts†L15-L69】【F:app/src/1-presentacion/componentes/dashboard/Dashboard.tsx†L10-L34】
- **Componentes UI**
  - `CorrelationsDashboard.tsx`: gráficos de calorías vs performance y macros diarios; genera frases interpretables y persistencia de insights locales para `userInsights`. Muestra mensajes dinámicos sobre relaciones sin exponer r/p-value en bruto (usa frases como "no hay suficientes días").【F:app/src/1-presentacion/componentes/correlaciones/CorrelationsDashboard.tsx†L570-L723】
  - `InsightsPanel.tsx` / `InsightCard.tsx`: renderizan tarjetas de insights con evidencia y acciones; dependen del tipo `PersonalInsight` de negocio.【F:app/src/1-presentacion/componentes/correlaciones/InsightsPanel.tsx†L1-L80】【F:app/src/1-presentacion/componentes/correlaciones/InsightCard.tsx†L1-L89】
- **Hallazgos UX**
  - No se detectan textos visibles con términos técnicos como “Pearson”, “Spearman” o “p-value”; el copy se mantiene en lenguaje natural (frases de correlación e insights). Mantener esta línea pero revisar consistencia de mensajes para usuarios sin background técnico.【F:app/src/1-presentacion/componentes/correlaciones/CorrelationsDashboard.tsx†L594-L717】

## 5. Coherencia funcional (Informe vs Implementación)
- Registro de alimentación diaria/semanal: **Implementado** en `FoodTracker` con alta/búsqueda de alimentos (USDA) y persistencia en `foodDatabase` vía `foodDataService`.【F:app/src/1-presentacion/componentes/alimentacion/FoodTracker.tsx†L1-L90】
- Registro de entrenamientos y rendimiento: **Implementado** en `WorkoutTracker` con catálogo de ejercicios y guardado de sesiones/performance en Firestore.【F:app/src/1-presentacion/componentes/entrenamiento/WorkoutTracker.tsx†L2-L120】
- Dashboard/panel de métricas: **Implementado** en `Dashboard.tsx` (calorías del día, comidas, entrenos semana, energía, banners de perfil/proactivo).【F:app/src/1-presentacion/componentes/dashboard/Dashboard.tsx†L12-L173】
- Panel de correlaciones/insights: **Implementado** en `CorrelationsDashboard.tsx` con gráficos y lista de insights generados localmente y/o IA.【F:app/src/1-presentacion/componentes/correlaciones/CorrelationsDashboard.tsx†L540-L723】
- Chat/Asistente IA vía Cloud Functions: **Implementado**; `useChat` llama a Function `chat` y `ChatBot` provee UI y quick actions.【F:app/src/1-presentacion/hooks/useChat.ts†L1-L116】【F:app/src/1-presentacion/componentes/chatbot/ChatBot.tsx†L1-L92】
- Análisis proactivo semanal: **Parcial/legacy**; existen Functions `analisisSemanalGenerar/Programado`, pero el frontend usa `proactiveService` como placeholder sin backend (devuelve null).【F:functions/src/analisisSemanal.ts†L1-L111】【F:app/src/2-logica-negocio/servicios/proactiveService.ts†L1-L20】【F:app/src/1-presentacion/componentes/dashboard/Dashboard.tsx†L90-L134】
- Base de alimentos verificados: **No implementado explícitamente**; se usa USDA API para búsquedas y colección `foodDatabase`/`userFoodEntries`, pero no hay referencia a un catálogo verificado propio en el repo.【F:app/src/3-acceso-datos/apis-externas/usdaFoodAPI.ts†L1-L140】【F:app/src/3-acceso-datos/firebase/foodDataService.ts†L1-L120】

## 6. Cloud Functions en uso vs legacy
- **En uso (evidencia de llamadas desde frontend)**
  - `chat` (callable): invocado desde `useChat` mediante `httpsCallable`, maneja sesiones de chat Apolo.【F:app/src/1-presentacion/hooks/useChat.ts†L5-L116】【F:functions/src/chat/chatHandler.ts†L1-L79】
  - `generateInsights` (callable): utilizado por `CorrelationInsightsService.generateInsightsWithAI` para enriquecer insights personales.【F:app/src/2-logica-negocio/servicios/correlationInsightsService.ts†L682-L725】【F:functions/src/generateInsights.ts†L16-L116】
- **Legacy / sin uso aparente desde frontend**
  - `analisisSemanalGenerar` y `analisisSemanalProgramado`: no se encontraron referencias en la app; el frontend usa `proactiveService` placeholder, por lo que estas Functions no se consumen actualmente. Revisar antes de retirarlas o conectar UI.【F:functions/src/analisisSemanal.ts†L1-L142】【F:app/src/2-logica-negocio/servicios/proactiveService.ts†L1-L20】

## 7. Comentarios y documentación a normalizar
- `functions/src/chat/chatHandler.ts` líneas 12-15: comentario en inglés “Initialize admin (guard against multiple in emulators)”.【F:functions/src/chat/chatHandler.ts†L12-L15】
- `functions/src/generateInsights.ts` línea 20: comentario en inglés “Ensure admin initialized (mirrors chat handler convention)”.【F:functions/src/generateInsights.ts†L20-L23】
- Mantener consistencia trasladando estos mensajes a español en futuras limpiezas.

## 8. Recomendaciones priorizadas
- **Alta prioridad**
  - Revisar y documentar el uso o deprecación de `analisisSemanal*`: decidir si se conecta al frontend o se mueve a legacy para evitar expectativas de análisis proactivo inconcluso.
  - Mantener el flujo de autenticación y servicios críticos (`AuthProvider`, `chat`, `generateInsights`) sin refactors sin pruebas, dado su impacto transversal.
- **Media prioridad**
  - Limpiar o mover a carpeta legacy `metricsService` y la instancia exportada `correlationInsightsService` si se confirma que no se usan.
  - Consolidar mensajes de correlaciones en CorrelationsDashboard para reforzar lenguaje simple y consistente en toda la UI.
- **Baja prioridad**
  - Normalizar comentarios en inglés dentro de Cloud Functions para mantener coherencia idiomática.
  - Etiquetar `proactiveService` como stub/legacy hasta que exista backend real, evitando confusión en el Dashboard.
