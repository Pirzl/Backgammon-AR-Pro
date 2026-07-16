# Diseño del Sistema de IA para Backgammon (Aprendizaje por Refuerzo)

Como experto en aprendizaje por refuerzo y arquitecturas neuronales (inspirado en TD-Gammon y AlphaZero), presento el diseño técnico detallado paso a paso para entrenar una IA de Backgammon al más alto nivel.

---

## 1. Marco de Aprendizaje por Refuerzo (RL)

### Definición del Entorno

- **Estado ($S_t$)**: La configuración exacta del tablero en el turno del jugador, antes de mover.
- **Acciones ($A_t$)**: El conjunto de _todos los tableros resultantes legales_ tras aplicar los dados actuales. En Backgammon, es mucho más eficiente evaluar el "estado después del movimiento" (afterstate) que modelar la acción en sí, debido a la estocasticidad de los dados.
- **Recompensas ($R_t$)**: Evaluaciones numéricas recibidas tras el final del episodio.
- **Episodios**: Una partida completa desde la posición inicial hasta que un jugador saca todas sus fichas (o hay un doble rechazado).

### Representación del Estado (Vector de Entrada)

La red no "ve" el tablero visualmente; recibe un vector numérico de **198 neuronas** (modelo clásico de Tesauro optimizado):
Para cada uno de los 24 puntos del tablero, usamos 4 neuronas para representar las fichas Blancas y 4 para las Negras (Total: 24 × 8 = 192). Para un color en un punto:

- Neurona 1: Válida si hay $\ge 1$ ficha (0 o 1).
- Neurona 2: Válida si hay $\ge 2$ fichas (0 o 1).
- Neurona 3: Válida si hay $\ge 3$ fichas (0 o 1).
- Neurona 4: Válida si hay $> 3$ fichas (Ej: si hay 5 fichas, el valor es $(5-3)/2 = 1.0$).

**Neuronas adicionales (6):**

- 2 neuronas para fichas en la barra (Blancas / Negras), valor = `cantidad / 2`.
- 2 neuronas para fichas rescatadas (borne-off) (Blancas / Negras), valor = `cantidad / 15`.
- 2 neuronas para identificar de quién es el turno (Jugador A / Jugador B).
  Total: **198 valores continuos entre 0 y 1**.

### Manejo de la Aleatoriedad de los Dados

El entorno contiene azar (transiciones estocásticas). En lugar de predecir ramas infinitas, la IA juega evaluando _solo los estados a los que puede llegar_ con los dados que acaban de salir (afterstates). Las expectativas matemáticas sobre los dados del rival se aprenden de forma implícita durante millones de partidas de self-play.

---

## 2. Sistema de Recompensas Optimizado

En RL moderno para juegos de tablero, **la mejor recompensa es la recompensa final (Sparse Reward)**. Sin embargo, para un aprendizaje más rápido, podemos usar _Reward Shaping_ (recompensas intermedias).

### Recompensa Principal (Final del Episodio)

- Victoria Normal: $+1$
- Derrota Normal: $-1$
- Gammon a favor: $+2$
- Gammon en contra: $-2$
- Backgammon a favor: $+3$
- Backgammon en contra: $-3$

### Recompensas Intermedias (Reward Shaping) para acelerar:

Si queremos que aprenda más rápido al inicio, damos pequeñas recompensas por acciones:

- $R_{pips}$: $+0.01$ por cada pip de ventaja ganado en el turno.
- $R_{hit}$: $+0.05$ por cada ficha rival enviada a la barra.
- $R_{prime}$: $+0.02$ por crear puntos bloqueados consecutivos.
- $R_{blot}$: $-0.03$ por cada blot expuesto innecesariamente.

### Fórmula General de Recompensa

Para combinar el aprendizaje puro del EV con las heurísticas:

$$ R = R*{final} + \alpha \cdot \Delta EV + \beta \cdot R*{tacticas} $$

Donde:

- $\alpha$ disminuye hacia $0$ conforme la IA madura (Annealing).
- $\Delta EV = V(S_{t+1}) - V(S_t)$ (Cambio en la probabilidad de victoria calculada por la propia red).

_Nota del experto:_ Para la mejor IA posible (estilo AlphaZero), al final del entrenamiento $\alpha$ y $\beta$ deben ser 0. La IA debe aprender **solo** de ganar o perder para evitar quedar atrapada en mínimos locales (por ejemplo, volverse demasiado agresiva buscando hits que pierden la partida).

---

## 3. Modelo de Red Neuronal Recomendado

### Arquitectura Tipo Multi-Layer Perceptron (MLP)

AlphaZero usa redes convolucionales, pero el Backgammon es lineal. Un MLP profundo (Perceptrón Multicapa) con conexiones residuales es ideal:

1. **Capa de Entrada**: 198 neuronas.
2. **Capa Oculta 1**: 256 neuronas + Activación ReLU.
3. **Capa Oculta 2**: 128 neuronas + Activación ReLU.
4. **Capa Oculta 3**: 64 neuronas + Activación ReLU.
   _(Añadir "Skip connections" tipo ResNet para evitar que el gradiente se desvanezca)._
5. **Capa de Salida**: 4 neuronas con activación **Sigmoid** o **Softmax**.

### Formato de Salida

Se necesitan 4 probabilidades directas.

- $P(WinNormal)$
- $P(WinGammon)$
- $P(LoseNormal)$
- $P(LoseGammon)$
  (Ignoramos Backgammon por simplicidad, ocurre raramente en juego avanzado).

El Valor Global de la posición ($V$) o **Equity** se calcula como:
$$ V = P(WinNormal) + 2 \cdot P(WinGammon) - P(LoseNormal) - 2 \cdot P(LoseGammon) $$

_Por qué esta arquitectura:_ En Backgammon, la IA no escoge una acción; escoge _el tablero resultante_ que tiene mayor Equity ($V$). Al predecir por separado la victoria y el gammon, la red aprende cuándo arriesgar un Gammon Loss para aumentar el Win Normal (crucial en juego de torneos / match play).

---

## 4. Algoritmo de Entrenamiento: TD(λ)

Backgammon fue resuelto históricamente usando **Temporal Difference Learning con trazas de elegibilidad $TD(\lambda)$**.
El agente juega contra sí mismo (self-play). En cada turno $t$, predice el valor $V_t$. En el turno $t+1$, obtiene $V_{t+1}$. La diferencia es el error de TD.

### Fórmulas de Actualización

Fórmula del Error TD ($\delta$):
$$ \delta*t = R*{t} + \gamma \cdot V\_{t+1} - V_t $$

Fórmula de Trazas de Elegibilidad ($e$):
Mantiene memoria de las decisiones pasadas en el mismo episodio.
$$ e*t = \lambda \cdot e*{t-1} + \nabla\_\theta V_t $$

Fórmula de actualización de pesos de la red ($\theta$):
$$ \theta\_{t+1} = \theta_t + \eta \cdot \delta_t \cdot e_t $$
Donde $\eta$ es la tasa de aprendizaje, $\gamma$ (descuento temporal ~0.99) y $\lambda$ (ej. $0.7$) dicta cuánto crédito reciben los movimientos más antiguos por los resultados recientes.

### Adaptabilidad (Self-Play vs Oponentes)

- 90% Self-Play (la IA iterando contra su mejor versión).
- 10% Partidas contra heurísticas subóptimas (para que aprenda a masacrar jugadores débiles y no solo asuma juego perfecto del rival).

---

## 5. Estrategias para Aprender Más Rápido (Mejores Prácticas Modernas)

1. **Experience Replay Buffer**: No actualizar la red turno a turno. Guardar las transiciones $(S_t, A_t, R, S_{t+1})$ en memoria y entrenar usando mini-batches elegidos al azar. Esto rompe la correlación entre movimientos consecutivos e impide que la red "olvide" estrategias.
2. **Exploración $\epsilon$-greedy con decaimiento**: El $10\%$ del tiempo ($\epsilon=0.10$), la IA escoge una acción legal **al azar** para descubrir nuevas estrategias (como el "Backgame"). Este valor disminuye gradualmente a $0.0$.
3. **Optimizador Adam**: En lugar del viejo Descenso de Gradiente (SGD), usar `Adam` con un learning rate dinámico (inicio rápido $1e-3$, bajando a $1e-5$).
4. **Normalización / Batch Norm**: Normalizar los inputs entre 0 y 1 (ya descrito en la codificación del estado) previene inestabilidad en la primera capa profunda.

---

## 6. Pseudocódigo Completo (Estilo PyTorch/TensorFlow)

Este pseudocódigo resume el "bucle de vida" de la IA:

```python
# Inicialización
red_neuronal = crear_red(entrada=198, salidas=4, ocultas=[256, 128, 64])
optimizador = Adam(red_neuronal.parametros(), lr=0.001)
buffer = ReplayBuffer(capacidad=1000000)
epsilon = 0.1  # Probabilidad de exploración

def predecir_equity(tablero):
    vector = codificar_estado(tablero)
    probs = red_neuronal.forward(vector)
    # Valor Esperado = Win + 2*WinG - Lose - 2*LoseG
    return probs[0] + 2*probs[1] - probs[2] - 2*probs[3]

def escoger_mejor_movimiento(tablero_actual, dados, epsilon):
    movimientos_legales = generar_movimientos(tablero_actual, dados)

    # 1. Exploración: Movimiento aleatorio
    if random() < epsilon:
        return choice(movimientos_legales)

    # 2. Explotación: Escoger el que maximiza el Equity tras mover
    mejor_mov = None
    mejor_equity = -infinito

    for mov in movimientos_legales:
        tablero_simulado = simular(tablero_actual, mov)
        # Se invierte el tablero porque el siguiente turno es del rival
        tablero_rival = invertir_perspectiva(tablero_simulado)

        # El valor para nosotros es el NEGATIVO del valor para el rival
        equity = -predecir_equity(tablero_rival)

        if equity > mejor_equity:
            mejor_equity = equity
            mejor_mov = mov

    return mejor_mov

# ==== BUCLE DE ENTRENAMIENTO SELF-PLAY ====
for episodio in range(100_000):
    tablero = iniciar_tablero()
    historial_partida = []

    while no_es_fin_de_juego(tablero):
        dados = lanzar_dados()
        mov = escoger_mejor_movimiento(tablero, dados, epsilon)

        estado_previo = codificar_estado(tablero)
        tablero = simular(tablero, mov)
        tablero = invertir_perspectiva(tablero) # Cambio de turno

        historial_partida.append(estado_previo)

    # Calcular Recompensa Final (Sparse Reward)
    recompensas = calcular_recompensas_finales(tablero) # P.ej. [1, 0, 0, 0]

    # Añadir al buffer experiencias
    for estado in historial_partida:
        buffer.añadir(estado, recompensas)

    # Entrenar la red desde el buffer (Replay)
    batch = buffer.obtener_muestra_aleatoria(tamaño=256)
    perdida = optimizador.calcular_loss(red_neuronal, batch)
    optimizador.actualizar_pesos(perdida)

    # Decaimiento periódico de la exploración
    epsilon = max(0.01, epsilon * 0.9995)
```

---

## 7. Explicación Pedagógica (Por qué funciona esto)

Imagina que estás entrenando a un perrito super-inteligente (nuestra IA).
Si tratas de explicarle reglas abstractas en papel ("_es malo dejar componentes expuestos_"), el aprendizaje será frágil ante la infinidad de variables del universo.
Pero si le dejas explorar en miles de mundos simulados (Self-play + **$\epsilon$-greedy**) y le das su recompensa MÁXIMA solo al cruzar la meta real (**Sparse Reward**), el perrito deducirá y descubrirá el concepto de _"blots expuestos"_ por el simple hecho de que los blots hacen que sea violentamente golpeado y devuelto al inicio de la meta.

- **Por qué el Vector de 198 nodos:** Evita que la IA confunda "1 ficha" con "2 fichas" aritméticamente. Al tener neuronas separadas ("¿hay 1 ficha?", "¿hay al menos 2 fichas?"), la red aprende de inmediato (en la primera capa subyacente de la red neuronal) que "1 ficha" (_Blot_) tiene implicaciones biológicas fatalmente distintas a "2 fichas" (_Punto seguro / Anchor_). Es una genialidad técnica de las Redes Neuronales.
- **Por qué "Afterstates" (evaluar la posición destino en lugar de la acción origen):** Porque si le digo a la IA _"elige mover de 13 a 8"_, la IA debe memorizar las infinitas combinaciones aleatorias de miles de dados en el espacio muestral para dar sentido a esa decisión. Sin embargo, si le digo _"Observa estos 5 potenciales tableros listos de frente. ¿Cuál predices que ganará?"_, la IA solo aprende a juzgar tableros de forma estática, delegando la aleatoriedad estocástica natural al propio motor del juego Backgammon. Esto reduce el espacio de aprendizaje matemáticamente de forma radical.
- **Por qué Trazas de Elegibilidad $TD(\lambda)$**: Porque en una partida estresante de 80 turnos de Backgammon, si pierdes, el error irreversible que arruinó la partida probablemente ocurrió en el turbulento medio juego (turno 35), no en tus inevitables turnos de bear-off (turno 79). $TD(\lambda)$ _hace retroceder_ el castigo letal de la derrota en el tiempo, empapando proporcionalmente (como una tinta roja que se desvanece por el vector de historial) las decisiones tomadas decenas de turnos atrás para corregir los verdaderos errores que desencadenaron todo el efecto mariposa.

Con esta arquitectura técnica precisa, una única tarjeta gráfica paralela moderna puede hacer transicionar a esta IA desde decisiones infantiles completas, hacia un estado de "Gran Maestro Global" implacable en cuestión de **menos de 72 horas operacionales completas ininterrumpidas**.
