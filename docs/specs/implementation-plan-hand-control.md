# Implementation Plan - Hand Interaction Optimization

## Goal

Optimize hand tracking for low-end devices (Vivo V50 Lite) and High-End (iPad Pro), ensuring standard "Pinch-to-Move" interaction works flawlessly without lag or coordinate misalignment.

## User Review Required

> [!IMPORTANT]
> **Hardware Acceleration**: We will attempt to use GPU (WebGL) first. If it fails, we will fall back to CPU. On very low-end devices, CPU might be slow (~10fps).
> **Frame Skipping**: We will implement a dynamic frame skipper. If the device detects low performance, it will process vision every 2nd or 3rd frame while keeping the UI at 60fps.

## Proposed Changes

### Hand Tracking Core (`src/features/hand-tracking/`)

#### [MODIFY] [useMediaPipe.ts](file:///e:/Proyecto/BACKGAMMON/BACKGAMMON-VIVO%20-%20copia/src/features/hand-tracking/lib/useMediaPipe.ts)

- **Fix `IMAGE_DIMENSIONS` error**: Add strict checks for `video.videoWidth > 0`.
- **Delegate Fallback**: Implement `GPU` -> `CPU` fallback chain.
- **Dynamic Throttling**: Implement logic to skip frames if processing takes too long (>33ms).

#### [MODIFY] [HandTrackingLayer.tsx](file:///e:/Proyecto/BACKGAMMON/BACKGAMMON-VIVO%20-%20copia/src/features/hand-tracking/ui/HandTrackingLayer.tsx)

- **Video Attributes**: Add `playsInline`, `webkit-playsinline`, `muted`, `autoPlay` to `<video>`.
- **Battery Saver**: Ensure camera stops when component unmounts.

#### [MODIFY] [useHandInteraction.ts](file:///e:/Proyecto/BACKGAMMON/BACKGAMMON-VIVO%20-%20copia/src/features/hand-tracking/lib/useHandInteraction.ts)

- **Universal Coordinates**: Verify `adjustForObjectCover` logic for 20:9 vs 4:3 ratios.
- **Smoothing**: Verify `OneEuroFilter` settings are optimal for removing "jitter".

### Game Board Interaction

#### [MODIFY] [GameBoard.tsx](file:///e:/Proyecto/BACKGAMMON/BACKGAMMON-VIVO%20-%20copia/src/features/game-board/ui/GameBoard.tsx)

- **Hit Testing**: Ensure `elementFromPoint` uses correct coordinates derived from the optimized mapping.

## Verification Plan

### Manual Verification

- **Low-End Simulation**: Use Chrome DevTools "Low-End Mobile" throttle.
- **Aspect Ratio Test**: Resize browser window to 20:9 and 4:3.
- **Pinch Test**: Confirm checkers can be picked up and moved smoothly.
  - Aplicar Inversión X (Espejo).

## Fase 2: Actualización del Motor de Gestos

_Objetivo: Integrar lógica en el hook existente._

### 2.1 Refactorizar `useGestureRecognition`

- **Inputs:** Inyectar dimensiones de pantalla/video.
- **Pipeline:**
  1. `Raw Coordinates` -> 2. `Aspect Ratio Correction` -> 3. `One Euro Filter` -> 4. `Output Coordinates`.
- **Fail-Safe Check:**
  - Si `!results.landmarks`, activar estado `TRACKING_LOST`.
  - Resetear `isPinching` a `false` de forma segura.
- **Ajuste de Umbrales:**
  - Actualizar `PINCH_THRESHOLD` a `0.05` (ajustable).
  - Validar zona muerta (0.04 - 0.06).

## Fase 3: Capa de Interacción y UX "Pro Max"

_Objetivo: Hacer que el sistema se sienta físico, preciso y robusto._

### 3.1 Hook `useHandInputAdapter` (Lógica Central)

- **Cálculo de Offset:** `y_interaction = y_smoothed - 70px`.
- **Gestión de Eventos:** Lógica estándar de Mouse Events.
- **Haptics:** `navigator.vibrate(20)` en Grab.
- **Fail-Safe:** Si recibe `TRACKING_LOST`, liberar cualquier drag activo (`mouseup`).

### 3.2 Componente `<GhostHandCursor />`

- **Visuales Dinámicos:**
  - **Profundidad (Eje Z):** Mapear `landmark.z` a escala/opacidad. (Lejos = 0.5 opacity, Cerca = 1.0).
  - **Estado:** Hand (Open) / Fist (Grab) / Fade-out (Tracking Lost).
- **Posición:** Absoluta en `(x_interaction, y_interaction)`.

## Fase 4: Optimización Móvil y Calibración

_Objetivo: Performance y UX._

### 4.1 Debugger Visual

- Crear un componente `<HandDebugOverlay />` temporal.
- Dibujar:
  - Puntos crudos (Rojo).
  - Puntos filtrados (Verde) -> Para ver el lag vs jitter.
  - Estado de Pinch (Texto en pantalla).

### 4.2 Ajuste de Aspect Ratio

- Verificar en iOS (Safari) comportamiento de barra de navegación (cambia el `innerHeight`).
- Usar `ResizeObserver` para mantener las coordenadas sincronizadas con el canvas real.

---

## Anexo A: Mejoras de Lógica de Negocio (Commercial Grade)

### A.1 Normalización de Profundidad (Zoom Normalization)

_Objetivo:_ Permitir agarrar fichas cómodamente con el brazo extendido.

- **Implementación:** Calibrar `PINCH_THRESHOLD` dinámico.
- **Referencia:** `threshold = BASE_THRESHOLD * (distance(Wrist, MiddleMCP) / REF_SCALE)`.

### A.2 Validación de Intención (Anti-Ruido)

_Objetivo:_ Evitar clicks fantasma por puños cerrados o baja confianza.

- **Filtro de Confianza:** Ignorar gestos si `handedness.score < 0.7`.
- **Filtro de "Mano Plana":** Validar que la palma no esté perpendicular a la cámara (usando producto cruz de vectores de la palma).

### A.3 Diferenciación Click vs Drag

_Objetivo:_ Permitir "Taps" rápidos sin arrastrar fichas accidentalmente.

- **Lógica:**
  - `MouseDown` -> Guardar `timestamp` y `origen`.
  - `MouseMove` -> Solo despachar si `distancia > 10px` O `tiempo > 200ms`.
  - `MouseUp` -> Si no fue Drag, despachar `Click`.

---

## Recomendaciones Adicionales (Mejoras Propuestas)

1.  **Cursor Visual ("Ghost Hand"):**
    - No confíe solo en que el usuario "sienta" donde está su mano. Muestre un cursor semitransparente o un halo brillante en la posición mapeada ($x, y$) para feedback inmediato.

2.  **Offset Vertical (Oclusión):**
    - Problema: El dedo tapa la ficha.
    - Solución: Mapee el cursor virtual 40-60 píxeles _arriba_ del punto de pinza físico. Esto permite ver la ficha mientras se mueve.

3.  **Feedback Háptico (Vibración):**
    - En móviles, usar `navigator.vibrate(20)` al detectar el estado GRAB para confirmar la acción físicamente.

4.  **Z-Axis Trigger (Profundidad):**
    - Considere usar la profundidad (eje Z) como confirmación secundaria. "Empujar" hacia la pantalla para confirmar el soltado (DROP).
