#!/usr/bin/env python3
"""
check_weights.py — Verifica que un model_weights.json NO esta colapsado.

Replica el forward pass de la red (198->256->128->64->1, ReLU+tanh) en Python
puro, sin dependencias, usando la MISMA arquitectura y encodeBoard que
src/features/ai-worker/nn-model.ts + training/net-arch.ts.

Sirve para detectar, ANTES de correr el torneo de 200 partidas, si los pesos
bajados de Colab estan "muertos":
  - salida casi constante (varianza ~0)  => red colapsada, no sirve
  - unidades ReLU muertas en masa         => aprendizaje detenido
  - salida saturada en +1/-1 siempre      => red degenerada

Uso:
  python scripts/check_weights.py [ruta/model_weights.json]
  (por defecto: public/model_weights.json relativo al cwd)

Criterio de veredicto:
  COLLAPSED  si std(preds) < 1e-3  (salida no reacciona a la entrada)
  COLLAPSED  si todas las preds estan en [-1.0,-0.98] o [0.98,1.0] (saturada)
  WARNING    si >50% de unidades de una capa oculta estan muertas (salida 0)
  ALIVE      en otro caso (la red produce salidas variadas => viva)
"""
import json
import math
import os
import random
import sys

# --- Arquitectura (debe coincidir con training/net-arch.ts) ---
INPUT = 198
HIDDEN = [256, 128, 64]
OUTPUT = 1
# Orden de tensores en el JSON: W1,b1,W2,b2,W3,b3,W4,b4
EXPECTED_SHAPES = [
    [INPUT, HIDDEN[0]], [HIDDEN[0]],
    [HIDDEN[0], HIDDEN[1]], [HIDDEN[1]],
    [HIDDEN[1], HIDDEN[2]], [HIDDEN[2]],
    [HIDDEN[2], OUTPUT], [OUTPUT],
]

# --- Constantes de tablero (de entities/game/constants.ts) ---
BAR_WHITE, BAR_BLACK = 26, 27
OFF_WHITE, OFF_BLACK = 28, 29

INITIAL_BOARD = [0] * 30
INITIAL_BOARD[1] = -2
INITIAL_BOARD[6] = 5
INITIAL_BOARD[8] = 3
INITIAL_BOARD[12] = -5
INITIAL_BOARD[13] = 5
INITIAL_BOARD[17] = -3
INITIAL_BOARD[19] = -5
INITIAL_BOARD[24] = 2


def encode_board(board, turn):
    """Replica AINNModel.encodeBoard (nn-model.ts lineas 175-210)."""
    fv = [0.0] * INPUT
    sign = 1 if turn == 'white' else -1
    opp_sign = -sign
    for point in range(1, 25):
        checkers = board[point] if 0 <= point < len(board) else 0
        base = (point - 1) * 8
        my = max(0, checkers) if sign == 1 else max(0, -checkers)
        opp = max(0, checkers) if opp_sign == 1 else max(0, -checkers)
        if my >= 1: fv[base + 0] = 1
        if my >= 2: fv[base + 1] = 1
        if my >= 3: fv[base + 2] = 1
        if my > 3: fv[base + 3] = (my - 3) / 2.0
        if opp >= 1: fv[base + 4] = 1
        if opp >= 2: fv[base + 5] = 1
        if opp >= 3: fv[base + 6] = 1
        if opp > 3: fv[base + 7] = (opp - 3) / 2.0
    my_bar = BAR_WHITE if turn == 'white' else BAR_BLACK
    opp_bar = BAR_BLACK if turn == 'white' else BAR_WHITE
    my_off = OFF_WHITE if turn == 'white' else OFF_BLACK
    opp_off = OFF_BLACK if turn == 'white' else OFF_WHITE
    fv[192] = abs(board[my_bar] if 0 <= my_bar < len(board) else 0) / 2.0
    fv[193] = abs(board[opp_bar] if 0 <= opp_bar < len(board) else 0) / 2.0
    fv[194] = abs(board[my_off] if 0 <= my_off < len(board) else 0) / 15.0
    fv[195] = abs(board[opp_off] if 0 <= opp_off < len(board) else 0) / 15.0
    fv[196] = 1.0 if turn == 'white' else 0.0
    fv[197] = 1.0 if turn == 'black' else 0.0
    return fv


def matvec(w, x, b):
    """y = relu(Wx + b) o tanh para la salida. W es [in,out], x es [in]."""
    out = []
    for j in range(len(b)):
        s = b[j]
        for i in range(len(x)):
            s += x[i] * w[i][j]
        out.append(s)
    return out


def relu(v):
    return [max(0.0, x) for x in v]


def tanh(v):
    return [math.tanh(x) for x in v]


def forward(fv, tensors):
    """tensors: lista de 8 arrays 2D/1D (W1,b1,...). Devuelve salida escalar."""
    W1, b1, W2, b2, W3, b3, W4, b4 = tensors
    x = relu(matvec(W1, fv, b1))
    h1 = x
    x = relu(matvec(W2, x, b2))
    h2 = x
    x = relu(matvec(W3, x, b3))
    h3 = x
    y = tanh(matvec(W4, x, b4))
    return y[0], (h1, h2, h3)


def make_random_board(rng):
    """Tablero aleatorio valido-ish: 15 fichas por bando repartidas."""
    board = [0] * 30
    points = list(range(1, 25))
    for _ in range(15):
        p = rng.choice(points)
        board[p] += 1
    for _ in range(15):
        p = rng.choice(points)
        board[p] -= 1
    return board


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join('public', 'model_weights.json')
    if not os.path.exists(path):
        print(f"ERROR: no existe {path}")
        sys.exit(2)
    with open(path, 'r', encoding='utf-8') as f:
        raw = json.load(f)
    w = raw.get('weights', raw)
    trained = raw.get('trained_count', 'n/a')
    if not isinstance(w, list) or len(w) != 8:
        print(f"ERROR: se esperaban 8 tensores, encontrados {len(w) if isinstance(w,list) else 'no-es-lista'}")
        sys.exit(2)
    # Validar shapes
    tensors = []
    for i, (layer, exp) in enumerate(zip(w, EXPECTED_SHAPES)):
        sh = layer.get('shape')
        if sh != exp:
            print(f"ERROR: tensor {i} shape {sh} != esperado {exp}")
            sys.exit(2)
        data = layer.get('data')
        tensors.append(data)
    # Reorganizar a matrices
    def to_mat(d, sh):
        rows, cols = sh
        return [[d[r * cols + c] for c in range(cols)] for r in range(rows)]
    W1 = to_mat(tensors[0], EXPECTED_SHAPES[0])
    b1 = tensors[1]
    W2 = to_mat(tensors[2], EXPECTED_SHAPES[2])
    b2 = tensors[3]
    W3 = to_mat(tensors[4], EXPECTED_SHAPES[4])
    b3 = tensors[5]
    W4 = to_mat(tensors[6], EXPECTED_SHAPES[6])
    b4 = tensors[7]
    T = [W1, b1, W2, b2, W3, b3, W4, b4]

    rng = random.Random(12345)
    samples = []
    samples.append(('initial/white', encode_board(INITIAL_BOARD, 'white')))
    samples.append(('initial/black', encode_board(INITIAL_BOARD, 'black')))
    for k in range(8):
        b = make_random_board(rng)
        samples.append((f'rand{k}/white', encode_board(b, 'white')))
        samples.append((f'rand{k}/black', encode_board(b, 'black')))

    preds = []
    hidden_states = ([], [], [])
    for name, fv in samples:
        y, hs = forward(fv, T)
        preds.append(y)
        for li, h in enumerate(hs):
            hidden_states[li].append(h)

    mean = sum(preds) / len(preds)
    var = sum((p - mean) ** 2 for p in preds) / len(preds)
    std = math.sqrt(var)
    mn, mx = min(preds), max(preds)

    # Unidades muertas por capa oculta
    dead = []
    for li, states in enumerate(hidden_states):
        n_units = len(states[0])
        dead_count = 0
        for u in range(n_units):
            if all(abs(st[u]) < 1e-9 for st in states):
                dead_count += 1
        dead.append((n_units, dead_count, dead_count / n_units))

    print(f"Archivo: {path}")
    print(f"Capas: 8 (198->{HIDDEN}->1) | trained_count={trained}")
    print(f"Predicciones sobre {len(samples)} tableros de prueba:")
    print(f"  mean={mean:.4f}  std={std:.4f}  min={mn:.4f}  max={mx:.4f}")
    print("Unidades muertas (ReLU->0 en TODOS los casos):")
    for li, (nu, dc, frac) in enumerate(dead):
        print(f"  capa oculta {li+1} ({nu} unidades): {dc} muertas ({frac*100:.1f}%)")

    # Veredicto
    saturated_low = all(p <= -0.98 for p in preds)
    saturated_high = all(p >= 0.98 for p in preds)
    collapsed = (std < 1e-3) or saturated_low or saturated_high
    heavy_dead = any(frac > 0.5 for _, _, frac in dead)

    print("---")
    if collapsed:
        if std < 1e-3:
            print("VEREDICTO: COLLAPSED — la salida no reacciona a la entrada (varianza ~0).")
        else:
            print("VEREDICTO: COLLAPSED — salida saturada constante en +1/-1.")
        print("  -> NO USES estos pesos. Reentrena (el run anterior colapso).")
        sys.exit(1)
    if heavy_dead:
        worst = max(dead, key=lambda d: d[2])
        print(f"VEREDICTO: WARNING — >50% unidades muertas en una capa ({worst[2]*100:.0f}%).")
        print("  -> Red viva pero aprendizaje muy limitado; revisar LR/epochs.")
        sys.exit(0)
    print("VEREDICTO: ALIVE — la red produce salidas variadas (no colapsada).")
    if trained == 0 or trained == 'n/a':
        print("  -> Pesos sin entrenar (random). Corre el torneo para medir winrate.")
    else:
        print("  -> Pesos entrenados. Corre el torneo para confirmar >=55%.")


if __name__ == '__main__':
    main()
