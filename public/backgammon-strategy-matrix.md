# Backgammon Strategy Matrix v1.0

## Prompt / Knowledge Base para la IA

Instrucciones para el sistema: Evalúa esta información en cada turno para maximizar la probabilidad de victoria.  
**Aplica estas reglas sin importar el color de la IA (white/black) y durante toda la partida: apertura, medio juego y final.**

### 1. TABLA DE APERTURA OBLIGATORIA (MOVER PRIMERO)
Si es el primer lanzamiento del juego, ejecuta exactamente esta jugada según los dados:

- 3-1 → 8/5, 6/5 (Haz el punto 5. Es la prioridad máxima).
- 6-1 → 13/7, 8/7 (Haz el punto 7).
- 4-2 → 8/4, 6/4 (Haz el punto 4).
- 5-3 → 8/3, 6/3 (Haz el punto 3).
- 6-5 → 24/13 (Escapa corriendo).
- 2-1 → 13/11, 6/5 (Prioriza el punto 5).
- 4-1, 5-1 → 24/23, 13/x (Divide la retaguardia y baja del centro).
- 3-2, 4-3, 5-4 → Prioriza mover la ficha del punto 24 (dividir) combinado con bajar del punto 13.
- 6-2, 6-3, 6-4 → Prioriza escapar la ficha del punto 24 hacia el 18, 15 o 14.

### 2. DETECCIÓN DE FASE Y ESTRATEGIA DOMINANTE
Evalúa el estado del tablero y elige UNA de estas 5 estrategias como plan principal:

- SI (Mi Pip Count es < Pip Count rival por más de 30 puntos) → ESTRATEGIA DE CARRERA: Mueve SIEMPRE la ficha más retrasada primero. No ataques, solo corre hacia tu casa.
- SI (Tengo un ancla en punto 20 o 21 del rival) → ESTRATEGIA DE ESPERA (Holding): NO muevas esas fichas ancla. Espera a que el rival deje un blot para golpear desde ahí.
- SI (Tengo 3 o más puntos consecutivos entre mi punto 2 y el 10) → ESTRATEGIA DE PRIMA: Construye la barrera. Si tienes 6 puntos seguidos (prima completa), el rival no puede pasar sin dobles.
- SI (El rival tiene una ficha en la barra) → ESTRATEGIA DE ATAQUE (Blitz): Cierra tu casa (puntos 1 al 6). No importa el resto. Golpea todo lo que puedas.
- SI (Voy perdiendo por mucho y tengo 2 anclas profundas) → ESTRATEGIA DE FONDO (Back-game): Sacrifica fichas para que el rival abra su casa y busca un golpe milagroso.

### 3. REGLAS TÁCTICAS DE ORO (Aplicar SIEMPRE antes de mover)

#### A. Regla del Golpe (Decisión binaria):
- SI (Tengo oportunidad de golpear un blot rival Y tengo al menos 3 puntos hechos en mi casa) → ENTONCES GOLPEA SÍ.
- SI (Tengo oportunidad de golpear PERO mi casa tiene 0, 1 o 2 puntos hechos) → ENTONCES NO GOLPEES. Mejor usa el turno para construir un punto sólido.

#### B. Regla del Slotting (Movimientos de riesgo calculado):
- SI (No puedo hacer un punto nuevo con mi tirada Y mi rival no tiene un blot cerca para golpearme) → ENTONCES deja un blot intencionado (slot) en el punto 3 o 5 de mi casa para intentar hacerlo en el siguiente turno.

#### C. Regla de la Ficha más Atrasada (Movimiento prioritario):
- SI (Tengo fichas apiladas en el centro y fichas atrasadas en la retaguardia) → ENTONCES mueve PRIMERO la ficha del punto 24, 23 o 22, aunque tengas que dejar un blot lejano. Esto "diversifica" tus números y evita quedarse atascado.

#### D. Regla de Sacar Fichas (Bear-off):
- SI (Estoy sacando fichas de mi casa) → ENTONCES usa los dados altos para quitar las fichas de los PUNTOS MÁS ALTOS (6 y 5) antes que las de los bajos. Esto optimiza la eficiencia de futuras tiradas.
- SI (El rival tiene un ancla en mi casa) → ENTONCES NUNCA dejes un blot al sacar. Es mejor no sacar una ficha y mover otra dentro de casa antes que arriesgar el golpe.

### 4. GESTIÓN DEL CUBO DE DOBLAR (Cálculo de probabilidad)
Usa esta lógica para decidir si ofreces el doble:

- SI (Estamos en fase de carrera Y mi pip count es menor al del rival en más de 8 puntos O la diferencia es mayor al 10% del total de pips) → ENTONCES ofrezco el DOBLE.
- SI (Tengo una prima de 5 puntos Y el rival está atrás) → ENTONCES ofrezco el DOBLE.
- SI (Mi posición es inferior O el rival tiene el turno de dados con ventaja) → ENTONCES NUNCA dobles.

### 5. ESTRATEGIA SEGÚN EL MARCADOR (Solo si es Match Play)
- SI (Voy ganando en el marcador global) → JUEGA DEFENSIVO. Prioriza NO perder por Gammon. Acepta perder 1 punto si es necesario.
- SI (Voy perdiendo en el marcador global) → JUEGA AGRESIVO. Arriésgate a dobles y golpes locos para intentar ganar por Gammon (2 puntos).

### 6. REGLA DE ABANDONO DEL ANCLA (Movimiento de supervivencia)
- SI (El rival ya pasó mi ancla con TODAS sus fichas Y tiene 4 o más puntos hechos en su casa) → ENTONCES ABANDONA EL ANCLA INMEDIATAMENTE. Mueve esas fichas hacia tu casa aunque dejes blots. Si no lo haces, te encerrarán y perderás.

### 7. FILOSOFÍA DE LA JUGADA FINAL (Anti-error)
- SI (Estoy indeciso entre dos movimientos) → PREGUNTA: "Si yo fuera el rival, ¿qué número de dados desearía tener ahora mismo?". SI mi movimiento le da exactamente ese número al rival, DESCARTA ese movimiento y elige el otro.

### ORDEN DE PRIORIDAD PARA LA IA
Ante cualquier tirada, la IA debe evaluar en este orden:
1. ¿Puedo hacer un punto nuevo (priorizando punto 5, 4, 7 y 3)?
2. ¿Puedo golpear siguiendo la "Regla del Golpe" (punto 3A)?
3. ¿Puedo escapar mi ficha más atrasada (punto 24)?
4. ¿Puedo desapilar el punto 13 o el punto 6 para equilibrar el tablero?
5. Si nada de lo anterior aplica, aplica la "Regla del Slotting" (punto 3B).
