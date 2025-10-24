# Guía de Pruebas Manuales: Sistema de Insights

Esta guía cubre pruebas manuales para validar el servicio de correlación de nutrición y rendimiento y su integración con el panel de correlaciones.

## Casos de Prueba

### CASO 1: Datos Insuficientes
- Contexto: Usuario nuevo con 0 a 6 días de registros de entrenamiento/comida en los últimos 14 días.
- Pasos:
  1. Inicia sesión con un usuario nuevo o uno sin suficientes datos.
  2. Abre la vista de correlaciones.
- Resultado esperado:
  - Se muestra la tarjeta "Datos Insuficientes" con el mensaje: "Necesitas al menos 7 días con entrenamientos para ver correlaciones. Actualmente: X."
  - InsightsPanel no muestra insights (o muestra el estado vacío con CTA) y no hay tarjetas de insights.

### CASO 2: Patrón de Carbohidratos Detectado
- Contexto: Usuario con 10 días de datos de entrenamiento y nutrición.
- Dataset guía (ejemplo):
  - 5 días con ~300g de carbohidratos y nivel de energía 8-9 (post o promedio diario)
  - 5 días con ~180g de carbohidratos y nivel de energía 3-4
- Pasos:
  1. Crea/inyecta datos en Firestore para un usuario de prueba que cumpla con el patrón anterior (en los últimos 14 días y con entrenamientos esos días).
  2. Abre la vista de correlaciones con ese usuario autenticado.
- Resultado esperado:
  - Aparece un insight de tipo "pattern" indicando que en días con mayor consumo de carbohidratos la energía fue notablemente superior.
  - El insight debe incluir evidencia (p. ej., diferencia de carbohidratos > 50g, promedio de energía en días altos vs bajos).

### CASO 3: Sin Patrones Claros (Recomendación de Consistencia)
- Contexto: Usuario con 10 días de datos inconsistentes (calorías/macros muy variables y energía baja o irregular).
- Pasos:
  1. Crea/inyecta datos donde la varianza (CV) de calorías sea alta (>25%) y el promedio de energía sea < 6.
  2. Abre la vista de correlaciones con ese usuario autenticado.
- Resultado esperado:
  - No aparecen insights de tipo "pattern" o "achievement".
  - Aparece un insight de tipo "recommendation" sugiriendo mejorar la consistencia calórica.

## Checklist de Validación UI/UX
- [ ] InsightsPanel se renderiza sin errores
- [ ] Spinner de loading aparece correctamente durante la carga de insights
- [ ] Tarjetas de insights muestran colores correctos según `type`: 
  - pattern (azul/morado)
  - achievement (verde)
  - recommendation (amarillo/naranja)
- [ ] Lista de evidencia visible como bullets (•)
- [ ] Sección "Qué hacer" visible, legible y con icono de confirmación
- [ ] No hay errores en la consola del navegador (DevTools)
- [ ] El hook `usePersonalInsights` invoca `correlationInsightsService.analyzeUserPatterns` y este consulta Firestore vía `userFoodService` y `workoutService`

## Comandos para Ejecutar y Verificar

> Ejecutar el frontend en modo desarrollo, navegar al dashboard y revisar logs/llamadas a Firestore

```powershell
# 1) Instalar dependencias (si es necesario)
cd "c:\Users\Gabriela\Desktop\Athlos-app\frontend"
npm install

# 2) Iniciar el servidor de desarrollo
npm run dev
```

- Navegar a: `http://localhost:5173/correlations` (o la ruta que tengas configurada para el dashboard de correlaciones)
- Abrir DevTools Console (F12) y verificar:
  - Mensajes del hook `usePersonalInsights` (en modo desarrollo): inicio/fin de carga, tamaño de insights, errores si los hay.
  - Llamadas a Firestore para `getUserFoodsByDate` y `getWorkoutsByDate` (si tienes logging en esos servicios).
- Validar el comportamiento según los casos descritos.

## Notas
- Los análisis actuales incluyen:
  - Carbs vs energía (días alto/ bajo consumo)
  - Proteína y recuperación (energía del día siguiente) en días consecutivos de entrenamiento
  - Consistencia calórica (CV) y energía promedio
- Asegúrate de que los datos de prueba caigan dentro de los últimos 14 días y que haya entrenamientos registrados esos días; de lo contrario, no se incluirán en las correlaciones.
