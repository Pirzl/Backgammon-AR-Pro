# PRD: Sistema de Sincronización CRM - Backgammon VIVO

## 1. Título del Documento
**Sistema de Presencia en Tiempo Real y Flujo de Invitaciones - Corrección de Sincronización CRM**

## 2. Resumen Ejecutivo
El sistema actual de presencia (online/offline) y gestión de invitaciones presenta **falsos positivos de conexión** (usuarios siempre aparecen "En Línea" aunque hayan cerrado la app) y **fallos en el flujo de invitaciones** (no se crea registro de `matches` al aceptar, lo que causa pantallas en negro). Se requiere una corrección arquitectónica del CRM (Customer Relationship Management) que aborde: (1) heartbeat unificado con timeout server-side, (2) creación atómica de `matches` al aceptar invitación, y (3) reducción del umbral de presencia de 5 minutos a 60 segundos.

## 3. Antecedentes / Situación Actual

### Arquitectura Actual
- **Dos heartbeats redundantes**: `supabase.ts` (20s vía RPC `update_user_presence`) y `AuthProvider.tsx` (30s vía `UPDATE profiles` directo). Sin coordinación entre ambos.
- **Umbral de 5 minutos**: `useRealtimePresences.ts:26` define `ONLINE_THRESHOLD = 5 * 60 * 1000`, lo que junto a heartbeats cada 20-30s garantiza que **ningún usuario aparezca offline**.
- **Sin server-side timeout**: No existe trigger ni cron job que marque usuarios offline tras X segundos sin heartbeat.
- **Invitación sin creación de match**: `InvitationInbox.tsx:102-118` actualiza `invitations.status='accepted'` pero **no crea un registro en `matches`**, obligando a `GameBoard.tsx:616-691` a hacer hasta 10 reintentos con 2s de espera para resolver `myColor`.
- **3 capas de broadcast redundantes**: WebRTC DataChannel → Supabase Signaling → Supabase Realtime Broadcast, con lógica de sincronización distribuida en 8+ archivos.

### Archivos Afectados (CRM)
| Archivo | Líneas | Rol |
|---------|--------|-----|
| `src/shared/api/supabase.ts` | 84-160 | Heartbeat + suscripción presencia |
| `src/features/auth/AuthProvider.tsx` | 6-65 | Heartbeat redundante (30s) |
| `src/features/client/hooks/useRealtimePresences.ts` | 1-61 | Detección online (threshold 5min) |
| `src/features/client/hooks/useClientData.ts` | 346-396 | Envío de invitaciones |
| `src/features/matchmaking/components/InvitationInbox.tsx` | 1-198 | Recepción/aceptación invitaciones |
| `src/features/client/components/UserPlayerDirectory.tsx` | 535-563 | Botón Invitar + chequeo online |
| `src/features/client/components/NotificationPopup.tsx` | 22-41 | Toast de invitación |

## 4. Problemas Identificados

### CRM-001: Falso Positivo de Conexión (CRÍTICO)
- **Síntoma**: Todos los usuarios aparecen "En Línea" siempre.
- **Causa Raíz**: Heartbeats duales sin coordinación + threshold 5min + sin timeout server-side.
- **Evidencia**: `UserPlayerDirectory.tsx:535` (`isOnlineForInvite`) siempre es `true`; botón "Invitar" nunca se deshabilita.
- **Código de Error**: `PRESENCE_DUAL_HEARTBEAT` + `NO_SERVER_TIMEOUT`.

### CRM-002: Invitación Aceptada sin Match Row (CRÍTICO)
- **Síntoma**: Al aceptar invitación, ambos jugadores navegan al tablero pero ven pantalla en negro o "0 pts" en ROJAS/BLANCAS.
- **Causa Raíz**: `InvitationInbox.tsx:106-118` actualiza `invitations.status='accepted'` pero **no inserta** un registro en `matches`.
- **Evidencia**: `GameBoard.tsx:616-691` intenta resolver `myColor` desde `invitations` o `matches`; con 10 reintentos (20s total) antes de fallar.
- **Código de Error**: `INVITE_ACCEPT_NO_MATCH`.

### CRM-003: Sin Timeout Server-Side para Presencia (ALTA)
- **Síntoma**: Usuarios que cierran el navegador sin `beforeunload` (mobile, crash) quedan marcados como online permanentemente.
- **Causa Raíz**: No hay trigger SQL, RPC, ni cron job que marque `profiles.status='offline'` cuando `last_seen` supera X segundos.
- **Evidencia**: `AuthProvider.tsx:57` usa `beforeunload`, no confiable en móviles.
- **Código de Error**: `NO_SERVER_SIDE_PRESENCE_TIMEOUT`.

### CRM-004: Suscripciones Supabase Duplicadas (MEDIA)
- **Síntoma**: Consumo excesivo de recursos y eventos duplicados.
- **Causa Raíz**: `useClientData.ts:203-241`, `useRealtimePresences.ts:43-48`, `InvitationInbox.tsx:66-94`, `UserPlayerDirectory.tsx:161-183` abren canales Supabase independientes para la misma tabla `invitations` o `profiles`.
- **Código de Error**: `DUPLICATE_REALTIME_SUBSCRIPTIONS`.

## 5. Objetivos del PRD
1. **Unificar heartbeat de presencia** en un solo manager singleton que use Supabase Realtime Presence (WebSocket) como fuente primaria.
2. **Implementar timeout server-side** vía trigger SQL/RPC que marque offline tras 60s sin heartbeat.
3. **Reducir umbral de presencia** de 5 minutos a 60 segundos.
4. **Crear `matches` row atómicamente** al aceptar invitación, antes de navegar al tablero.
5. **Centralizar suscripciones CRM** en un proveedor dedicado para eliminar duplicación.

## 6. Especificaciones Funcionales

### CRM-F1: PresenceManager Unificado
**Archivo nuevo**: `src/shared/lib/PresenceManager.ts`
- **Singleton** que envía heartbeat cada 20s vía RPC `update_user_presence(p_user_id)`.
- **Integrado en `AuthProvider`**: se inicia al autenticarse, se detiene al cerrar sesión.
- **Desactiva** el heartbeat redundante de `AuthProvider.tsx:36`.
- **Métodos**: `start(userId)`, `stop()`, `isRunning(): boolean`.

### CRM-F2: Server-Side Presence Timeout
**Archivo**: Migración/Trigger SQL
- **Trigger `check_presence_timeout()`** en tabla `profiles`: si `last_seen < NOW() - INTERVAL '60 seconds'` y `status = 'online'`, setear `status = 'offline'`.
- O alternativamente: **RPC `cleanup_stale_presences()`** llamado por `pg_cron` cada 30s.
- **NOTA**: Si no hay acceso a BD, implementar **lado cliente**: el PresenceManager chequea `last_seen` en cada suscripción.

### CRM-F3: Reducción de Umbral a 60s
**Archivo**: `src/features/client/hooks/useRealtimePresences.ts:26`
- Cambiar `ONLINE_THRESHOLD` de `5 * 60 * 1000` a `60 * 1000`.
- **Además**: Usar `subscribeToPresence` (WebSocket Presence de Supabase) como fuente primaria, y DB como fallback.

### CRM-F4: Match Row en Acceptance Atómico
**Archivo**: `src/features/matchmaking/components/InvitationInbox.tsx:102-118`
- **Nuevo flujo** en `handleAccept`:
  1. Leer `invitation.sender_id`, `invitation.receiver_id`, `invitation.room_id`
  2. Actualizar `invitations.status = 'accepted'`
  3. **Insertar** en `matches`:
     ```sql
     { room_id, player_white: sender_id, player_black: receiver_id, status: 'waiting', cube_value: 1, cube_owner: null }
     ```
  4. Navegar a `/game?room=...&mode=human`

**Archivo**: `src/features/client/components/UserPlayerDirectory.tsx:194-223`
- **Misma corrección**: crear match row en `handleAcceptInvite`.

**Archivo**: `src/features/client/components/NotificationPopup.tsx:22-41`
- **Misma corrección**: crear match row en `handleAccept`.

### CRM-F5: CRM Provider Centralizado
**Archivo nuevo**: `src/features/crm/CRMProvider.tsx`
- Proveedor de contexto que expone:
  - `onlineUserIds: string[]` - IDs de usuarios en línea (vía Presence WebSocket)
  - `invitations: InvitationState[]` - invitaciones activas
  - `sendInvite(recipientId): Promise<void>` - método unificado
  - `acceptInvite(inviteId): Promise<void>` - acepta y crea match
  - `rejectInvite(inviteId): Promise<void>` - rechaza
- **Elimina suscripciones duplicadas** de `useClientData`, `UserPlayerDirectory`, `useRealtimePresences`.

### CRM-F6: UI Reactiva a Estado Online Real
**Archivo**: `src/features/client/components/UserPlayerDirectory.tsx:535`
- El botón "Invitar" se deshabilita **inmediatamente** cuando el usuario se desconecta.
- El badge de estado cambia sin animación "pulse" para evitar falsa sensación de conexión.

## 7. Criterios de Aceptación

### Definition of Ready (DoR)
- [ ] Archivos afectados identificados y leídos.
- [ ] PRD revisado y aprobado.
- [ ] Trigger SQL/RPC de timeout disponible en BD (o alternativa cliente implementada).
- [ ] Variables de entorno verificadas (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).

### Definition of Done (DoD)
- [ ] **CRM-001 corregido**: Usuario que cierra app aparece "Desconectado" en < 90s.
- [ ] **CRM-002 corregido**: Al aceptar invitación se crea `matches` row; tablero carga sin reintentos.
- [ ] **CRM-003 corregido**: Timeout server-side o cliente heartbeat-check marca offline tras 60s de inactividad.
- [ ] **CRM-004 mitigado**: Suscripciones CRM centralizadas en CRMProvider.
- [ ] Todos los tests existentes pasan (`npm test` o comando equivalente).
- [ ] Build sin errores (`npm run build`).
- [ ] No se modificó código del juego (`GameBoard.tsx` solo CRM, sin tocar lógica de juego).

## 8. Priorización y Esfuerzo Estimado

| ID | Prioridad | Esfuerzo | Descripción |
|----|-----------|----------|-------------|
| CRM-F1 | P0 | 3h | PresenceManager singleton + integración AuthProvider |
| CRM-F2 | P0 | 2h | Timeout server-side (trigger RPC o heartbeat-check) |
| CRM-F3 | P0 | 0.5h | Umbral 60s + refactor useRealtimePresences |
| CRM-F4 | P0 | 4h | Match row en acceptance (3 archivos) |
| CRM-F5 | P1 | 3h | CRMProvider centralizado |
| CRM-F6 | P1 | 1h | UI reactiva a estado online |

**Total estimado**: ~13.5 horas

## 9. Plan de Implementación (Fases)

### Fase 1: PresenceManager (CRM-F1 + CRM-F3)
1. Crear `src/shared/lib/PresenceManager.ts` (singleton heartbeat)
2. Integrar en `AuthProvider.tsx` (reemplazar heartbeat redundante)
3. Refactorizar `useRealtimePresences.ts` (threshold 60s + WebSocket primary)

### Fase 2: Server-Side Timeout (CRM-F2)
1. Implementar heartbeat-check en PresenceManager
2. Verificar con BD trigger o mantener cliente como alternativa

### Fase 3: Match Row en Acceptance (CRM-F4)
1. Modificar `InvitationInbox.tsx` - crear match al aceptar
2. Modificar `UserPlayerDirectory.tsx` - crear match al aceptar
3. Modificar `NotificationPopup.tsx` - crear match al aceptar

### Fase 4: CRMProvider + UI (CRM-F5 + CRM-F6)
1. Crear `src/features/crm/CRMProvider.tsx`
2. Migrar suscripciones
3. UI reactiva en directorio

## 10. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Trigger SQL no disponible en Supabase | Alta | Alto | Implementar heartbeat-check cliente + limpieza periódica |
| Race condition en creación de match | Media | Alto | Usar `upsert` con `room_id` único (generado en `sendGameInvite`) |
| Breaking change en suscripciones existentes | Media | Medio | Mantener compatibilidad hacia atrás por 1 semana |
| Usuarios en partida activa marcados offline | Baja | Medio | Excluir `status='in-game'` del timeout |

## 11. Glosario
- **CRM**: Sistema de gestión de relaciones con clientes (presencia, invitaciones, notificaciones).
- **Supabase Realtime Presence**: Sistema de presencia WebSocket de Supabase (no DB polling).
- **Heartbeat**: Señal periódica que indica que el usuario sigue conectado.
- **RPC**: Remote Procedure Call - función ejecutada en la base de datos.
- **Match Row**: Registro en la tabla `matches` que representa una partida activa.

## 12. Anexos

### A: Flujo Actual (Diagrama de Secuencia - Problema)
```
Player A                    Supabase                    Player B
   |--[heartbeat 20s]-------->|                            |
   |--[heartbeat 30s]-------->|                            |
   |                          |<--[heartbeat 20s]----------|
   |                          |<--[heartbeat 30s]----------|
   |                          |                            |
   |--[INSERT invitation]---->|                            |
   |                          |--[NOTIFY postgres_changes]->|
   |                          |                            |
   |                          |<--[UPDATE status=accepted]--|
   |<--[NOTIFY UPDATE]--------|                            |
   |                          |                            |
   |--[/game?room=...]------->|   <<NO MATCH ROW EXISTS>>  |
   |                          |<--[/game?room=...]---------|
   |                          |                            |
   |  [RETRY 10x en 20s]      |     [RETRY 10x en 20s]     |
```

### B: Flujo Corregido (Diagrama de Secuencia - Solución)
```
Player A                    Supabase                    Player B
   |--[heartbeat 20s via RPC]->|                            |
   |                          |                            |
   |--[INSERT invitation]---->|                            |
   |                          |--[NOTIFY postgres_changes]->|
   |                          |                            |
   |                          |<--[UPDATE status=accepted]--|
   |                          |--[INSERT match row]--------|  <<NUEVO>>
   |<--[NOTIFY UPDATE]--------|                            |
   |                          |<--[/game?room=...]---------|
   |--[/game?room=...]------->|   <<MATCH ROW EXISTS>>     |
   |                          |                            |
   |  [CARGA INMEDIATA]       |     [CARGA INMEDIATA]      |
   |                          |                            |
   |                          |                            |
   |<<CIERRA TAb>>            |                            |
   |                          |[60s timeout: status=offline]|
   |                          |                            |
   |<<APARECE OFFLINE>>       |     [isOnlineForInvite=false]
```
