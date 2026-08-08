# INFORME DE FIXES — VIVO Backgammon (H2H networking)

**Fecha**: 2026-08-08
**Branch**: `master` (fuente de verdad de hoy, base `477d12b`)
**Commit de los fixes**: `e6dae20`
**Estado del push**: ✅ **subido a GitHub** (`477d12b..e6dae20 master -> master`).

---

## 1. Resumen

Este informe documenta los fixes aplicados sobre `src/features/networking/lib/useVideoChat.ts`
para cerrar los huecos detectados en el flujo H2H (video + chat + micrófono). También documenta
la verificación y los dos puntos que quedan pendientes (push a GitHub y deploy FTP).

Verificación tras los cambios: **`tsc -b` ✅ 0 errores · vitest 88 pass / 9 fail · `npm run build` ✅**.

Los 9 tests que fallan son **exclusivamente** de `src/features/ai-worker/api.test.ts` y requieren
una instancia Supabase real (necesitan `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` válidos).
En este sandbox usan placeholders y fallan por red. **No es una regresión** — el baseline antes de
los fixes ya daba 88 pass / 9 fail.

---

## 2. Qué se arregló

### F3-gap: rellamada del rival rechazada tras colgar

**Problema**: tras `hangUp`, el `RTCPeerConnection` quedaba `closed`. Cuando el rival volvía a
llamar, `handleSignal` recibía la oferta pero el PC tenía `signalingState === 'closed'` (nunca
`'stable'`), así que la oferta se descartaba y **la rellamada no funcionaba** — el rival veía
"Esperando" para siempre.

**Fix en `handleSignal`** (`useVideoChat.ts`):
- Si `peerConnectionRef.current` es `null`, `closed` o `failed`, se reconstruye el PC vía
  `setupPeerConnection()` **antes** de procesar la oferta entrante.
- `handleSignal` y `startCall` añadieron `setupPeerConnection` a sus `useCallback` deps.

### F3-gap (limpieza): fugas al reconstruir el PC

**Problema**: cada reconstrucción del PC (ahora más frecuente con el fix anterior) apilaba una
nueva suscripción a `sharedCamera` y un nuevo interval de stats sobre el PC viejo.

**Fix en `setupPeerConnection`**:
- Al inicio: `unsubscribeSharedRef.current?.()` (libera la suscripción previa al stream compartido).
- Cierra el PC anterior si aún no está `closed`.

### F2/F5: la cámara ya no se podía volver a encender

**Problema**: `toggleVideo(false)` hacía `sender.replaceTrack(null)`. Al volver a llamar
`toggleVideo(true)`, el código iteraba `pc.getSenders()` y filtraba por `sender.track?.kind === 'video'` —
pero tras `replaceTrack(null)` el `sender.track` es `null`, así que el filtro **nunca volvía a
coincidir** y la cámara quedaba apagada para siempre (botón "on" sin efecto).

**Fix**: iterar `pc.getTransceivers()` en su lugar. El `receiver.track` conserva el `kind`
aunque el sender esté nuled, así que `replaceTrack(enabled ? videoTrack : null)` vuelve a funcionar.
Se mantiene `videoMutedRef` para que `ensureSharedTracks` no re-añada el track mientras el usuario
lo tiene apagado.

### F4: micrófono mudo en la llamada siguiente a colgar

**Problema**: `hangUp` hacía `sharedCamera.getStream()?.getAudioTracks().forEach(t => t.enabled = false)`.
Como el stream es **compartido** (app-wide, refcount), esa desactivación persistía: al volver a
llamar, el track de audio seguía `enabled=false` → la llamada nueva empezaba **sin micro** aunque la
UI mostrara el mic activo.

**Fix en `hangUp`**:
- Sustituido por `replaceTrack(null)` sobre los senders de **audio y video** (mismo patrón que
  `toggleVideo(false)`). El peer deja de oírnos/vernos, pero el track local del stream compartido
  permanece `enabled=true` → la siguiente llamada arranca con el micro vivo.
- No toca el `enabled` del audio compartido (eso ya no congela nada).

### F4: tracks añadidos tarde no se negociaban

**Problema**: si el track de audio (o un track de video) se añadía al PC después del
offer/answer inicial (p. ej. el audio llega al stream compartido tarde, o en móvil el getUserMedia
nace sin micro y `ensureAudio` lo añade después), el peer nunca lo recibía porque no había
renegociación.

**Fix**: handler `pc.onnegotiationneeded` en `setupPeerConnection`:
- Solo actúa si `connectionState === 'connected'` y `signalingState === 'stable'` (evita glare al
  inicio, cuando `startCall` crea el offer inicial).
- Crea un nuevo offer y lo reenvía por signaling.

---

## 3. Qué NO cambió (por decisión)

- **F1 (persistencia del chat)**: ya estaba implementado en `master` (`ChatPanel.tsx` con
  `POS_STORAGE_KEY`, `loadPos`/`savePos` y drag por pointer events). El "master prompt" que citaba
  F1 como pendiente estaba desactualizado. No requirió código.
- **F6 (chat "Esperando conexión...")**: el input del chat se bloquea cuando
  `connectionStatus !== 'connected'`. Con el fix F3-gap, una rellamada tras colgar vuelve a
  conectar el data channel → el chat vuelve a `connected`. No hizo falta más código.

---

## 4. Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/features/networking/lib/useVideoChat.ts` | Todos los fixes del §2 (único archivo modificado). |

`git status` tras los fixes: solo `src/features/networking/lib/useVideoChat.ts` modificado.

---

## 5. Pendientes

### 5.1 Push a GitHub — ✅ HECHO

El commit `e6dae20` se subió a `origin/master` con éxito (`477d12b..e6dae20 master -> master`).

Nota: el primer intento falló por el servicio de credenciales de la plataforma
(`git_identity not found for task ...`). Se resolvió con el fine-grained token de GitHub del
usuario (Contents: Read and write sobre `Pirzl/Backgammon-AR-Pro`), usando el token directamente
en la URL (`-c credential.helper=` para saltar el helper roto de la plataforma).

### 5.2 Deploy FTP (pre-existente, no bloqueante para los fixes)

El sitio `backgammon.free.nf` sigue caído por el MIME `text/html` de `/vendor-ui.js`. El fix de
código está listo en `master` (`477d12b`): `base: './'` en `vite.config.ts:9` + `public/.htaccess`
con `AddType application/javascript .js`, `Options -MultiViews` y rewrite SPA solo para rutas sin
extensión. **Pendiente**: subir `deploy-vivo.zip` (~24 MB) a `htdocs` raíz por FTP y verificar en
F12 que `/vendor-ui.js` responda `200` con `application/javascript`.

---

## 6. Cómo verificar (para Hermes)

1. `npx tsc -b` → debe dar 0 errores.
2. `npx vitest run` → 88 pass / 9 fail (los 9 fail son `api.test.ts`, requieren Supabase real).
3. `npm run build` → build OK.
4. `git log --oneline -3` → debe mostrar `e6dae20` sobre `477d12b`.
5. `git diff 477d12b e6dae20 -- src/features/networking/lib/useVideoChat.ts` → revisar el diff.

**Tests funcionales en navegador (2 dispositivos, H2H)**:
- Colgar la llamada y que el rival vuelva a llamar → debe conectar (F3-gap).
- Apagar la cámara y volver a encenderla → el rival debe ver el video de nuevo (F2/F5).
- Colgar, y que la siguiente llamada tenga el micro activo por defecto (F4).
- Chat: escribir tras una reconexión → debe enviarse (F6 vía F3-gap).
