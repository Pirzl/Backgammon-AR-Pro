# Protocolo de Interacción Manual y Visión Artificial (Hand Interaction Protocol)

**Estado:** Borrador / Análisis
**Fecha:** 2026-01-28
**Fuente:** Informe Técnico "Visión de Cámara - Agarre y Movimiento"

## 1. Visión General

Este documento define la arquitectura para implementar la manipulación de fichas (coger, mover, soltar) mediante visión artificial (MediaPipe Hand Tracking) en la aplicación Backgammon VIVO. El objetivo es una experiencia "natural", fluida y libre de temblores (jitterless).

## 2. Detección del Gesto "Pinza" (The Grip)

La mecánica principal se basa en la distancia euclidiana entre el pulgar y el índice.

- **Puntos de Referencia (Landmarks):**
  - `Landmark 4` (Punta del Pulgar - Thumb Tip)
  - `Landmark 8` (Punta del Índice - Index Tip)

- **Fórmula de Activación (Adaptive Threshold / Zoom Normalization):**
  _Problema:_ El umbral fijo falla si la mano está lejos (se ve pequeña).
  _Solución:_ Escalar el umbral según el tamaño aparente de la mano.
  $$d < 0.05 \times \text{HandScale}$$
  - **HandScale:** Distancia euclidiana entre Muñeca (0) y Nudillo Medio (9).
  - **Validación:** Si mano cerca (Scale=1.0) $\rightarrow$ Umbral=0.05. Si mano lejos (Scale=0.5) $\rightarrow$ Umbral=0.025.

- **Umbrales (Hysteresis):**
  - **GRAB (Agarre):** $d < 0.05$ (Unidades normalizadas)
  - **RELEASE (Soltar):** $d > 0.05$
  - _Recomendación:_ Implementar zona muerta (e.g., Grab en 0.04, Release en 0.06) para evitar parpadeo.

- **Filtro de Falsos Positivos (Flat Hand):**
  _Problema:_ Un puño cerrado o mano de lado puede activar falsos "Grip".
  _Solución:_ Validar intención.
  - **Regla:** Solo permitir GRAB si el índice de confianza `handedness.score > 0.7` Y (opcional) el dedo medio está extendido.

## 3. Mapeo de Coordenadas "Pro Max" (Offset y Espejo)

Para solucionar la oclusión (que el dedo tape la ficha) y mejorar la UX.

- **Fórmula Horizontal (Espejo) con Corrección de Aspecto:**
  _Problema:_ La cámara (4:3) difiere de la pantalla (16:9), causando "drift" en los bordes.
  _Solución:_ Implementar lógica de _crop_ virtual. Mapear x/y sobre el área de video _visible_ (cover) y no sobre el frame completo.

- **Fórmula Vertical (Con Offset de Visibilidad):**
  $$y_{virtual} = (y_{mapped} \times H_{screen}) - \text{Offset}_{px}$$

## 4. Estabilización Adaptativa (One Euro Filter)

El promedio simple no es suficiente (causa lag). Se requiere estabilización dinámica.

- **Implementación Obligatoria:** **One Euro Filter**.
- **Tuning Comercial (Backgammon VIVO):**
  - **minCutoff:** $0.5 - 1.0$ (Estabilidad estática).
  - **beta:** $0.007 - 0.1$ (Crucial: Permite "acelerar" sin lag).
  - _Objetivo:_ Sensación "magnética" y precisa.

## 5. Lógica de Intención (Click vs Drag)

No todo agarre es un arrastre.

- **Click (Tap):** Si $T_{grab} < 200ms$ Y $\Delta_{movement} < 10px$. (E.g. Lanzar dados).
- **Drag:** Si $T_{grab} > 200ms$ O $\Delta_{movement} > 10px$. (E.g. Mover ficha).

## 6. Integración "Pro Max" (Visual, Háptico y Eventos)

### A. Cursor Visual ("Ghost Hand") con Profundidad (Eje Z)

- **Posición:** $(x_{virtual}, y_{virtual})$.
- **Escala Dinámica (Feedback Z):**
  - Usar `Landmark 9 (Z)` o Muñeca.
  - Mano lejos: Cursor pequeño/transparente.
  - Mano cerca (Plano de interacción): Cursor 100% tamaño/opacidad.
- **Estado Grab:** Icono puño, `transform: scale(0.9)`, color confirmación.

### B. Feedback Háptico

- **Trigger:** Al entrar en estado `GRAB`.
- **Acción:** `navigator.vibrate(20)` (Android).

### C. Fail-Safe y Pérdida de Rastreo

¿Qué pasa si la mano sale del cuadro?

- **Detección:** Si `handedness.score < 0.5` o `landmarks` vacío.
- **Acción Inmediata:**
  1.  **Cursor:** Fade-out (desvanecer) instantáneo.
  2.  **Estado Grab:** Si estaba arrastrando, ejecutar `RELEASE` suave (soltar en origen o casilla válida). _Evita fichas "congeladas" en el aire._
  3.  **UI:** Mostrar indicador discreto "Poca luz / Mano fuera".

### D. Eventos Sintéticos

1.  **HOVER:** Cursor sigue mano (con offset).
2.  **GRAB:** Click en `(x, y)` + Vibración.
3.  **DRAG:** Arrastre continuo.
4.  **RELEASE:** Soltar + Snapping.

## 6. Consideraciones Móviles (Performance)

- **Loop:** Sincronizar con `requestAnimationFrame` (60 FPS target).
- **Cámara:** `facingMode: 'user'`.
- **Gestión de Memoria:** Manejar pérdida de contexto WebGL en Safari iOS.

---

## Gap Analysis (Current vs Target)

| Requisito              | Estado Actual (`useGestureRecognition.ts`) | Acción Requerida                                       |
| :--------------------- | :----------------------------------------- | :----------------------------------------------------- |
| **Detección Pinza**    | Implementado (Umbral 0.08/0.12)            | Ajustar umbrales a 0.05 (o configurable).              |
| **Hysteresis**         | Implementado (Debounce 50ms)               | Mantener, validar si el buffer espacial es suficiente. |
| **Mapeo Espejo**       | ❌ No implementado (Retorna Raw 3D)        | **Implementar mapeo 2D con inversión X.**              |
| **Estabilización**     | ❌ No implementado                         | **Implementar One Euro Filter.**                       |
| **Aspect Ratio**       | ❌ No implementado                         | **Añadir lógica de corrección de video vs pantalla.**  |
| **Eventos Sintéticos** | ❌ No implementado (Solo estado)           | **Crear adaptador `useHandInputAdapter`.**             |
