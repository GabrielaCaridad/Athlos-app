/**
 * Entrada de Cloud Functions v2 para Athlos.
 * Reexporta funciones y fija opciones globales.
 */

import { setGlobalOptions } from "firebase-functions/v2/options";
export { chat } from './chat/chatHandler';
export { analisisSemanalGenerar, analisisSemanalProgramado } from './analisisSemanal';
export { generateInsights } from './generateInsights';

// Límite global de instancias para evitar picos de coste
setGlobalOptions({ maxInstances: 10 });

// Agregar nuevos exports aquí si se añaden funciones futuras
