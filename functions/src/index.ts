/**
 * Punto de entrada de Cloud Functions (v2) para Athlos.
 * -----------------------------------------------------
 * Qué hace:
 * - Re-exporta módulos especializados (chat, análisis semanal, generación de insights).
 * - Aplica opciones globales (maxInstances) para control de costos.
 * Por qué:
 * - Centralizar exports mantiene el árbol más claro y permite añadir nuevas funciones
 *   sin modificar múltiples archivos.
 * Notas:
 * - Usamos setGlobalOptions para limitar contenedores concurrentes (evita picos de coste).
 * - Cada submódulo define su propia lógica y validaciones.
 */

import { setGlobalOptions } from "firebase-functions/v2/options";
export { chat } from './chat/chatHandler';
export { analisisSemanalGenerar, analisisSemanalProgramado } from './analisisSemanal';
export { generateInsights } from './generateInsights';

// Límite global de instancias para prevenir escalados extremos inesperados.
setGlobalOptions({ maxInstances: 10 });

// (Extensible) Agregar nuevos exports aquí si se añaden funciones futuras.
