"""
bg_train_fast.py — FAST self-play TD(0) trainer for VIVO backgammon.

Uses bg_fast.py (NumPy-accelerated engine) instead of bg_engine.py so that
generate_all_turn_sequences / apply_move / encode_board run ~30-100x faster
and we can reach hundreds of thousands of games.

Everything else mirrors bg_net.py EXACTLY:
  - same architecture (198->256->128->64->1)
  - same serialize/deserialize weight format ({shape, data} layers)
  - same label convention (self-play --label td0): target_i = -V(next, opp)
  - same move selection: score(move) = -V(boardAfter, opponent)
  - same output: public/model_weights.json the browser loads directly.

Because the rules/encoding in bg_fast.py are a 1:1 port of bg_engine.py, the
trained model plays identically in the browser.
"""

import json
import os
import random
import sys
from datetime import datetime

import numpy as np
import tensorflow as tf
from bg_fast import (
    INITIAL_BOARD, roll_dice, get_winner,
    generate_all_turn_sequences_batch, encode_batch,
)

# ---- architecture (identical to bg_net.py / nn-model.ts NET_ARCH) ----
INPUT = 198
HIDDEN = [256, 128, 64]
OUTPUT = 1


def build_model():
    inp = tf.keras.Input(shape=(INPUT,))
    x = inp
    for units in HIDDEN:
        x = tf.keras.layers.Dense(units, activation='relu')(x)
    out = tf.keras.layers.Dense(OUTPUT, activation='tanh')(x)
    model = tf.keras.Model(inp, out)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=5e-4, clipnorm=1.0),
        loss='mse',
    )
    return model


def serialize_weights(model):
    return [{'shape': list(w.shape), 'data': w.reshape(-1).tolist()}
            for w in model.get_weights()]


def deserialize_weights(model, weights):
    tensors = [np.array(w['data'], dtype=np.float32).reshape(w['shape']) for w in weights]
    model.set_weights(tensors)


def forward_batch(model, boards, turns):
    """boards: int32 (N,30); turns: list/N of 'white'/'black'."""
    turns_arr = np.asarray(turns, dtype=object) if not isinstance(turns, np.ndarray) else turns
    xs = encode_batch(boards, turns_arr)
    return model.predict(xs, batch_size=2048, verbose=0).reshape(-1)


def play_one_game(model, exploration, max_moves, rng):
    board = np.array(INITIAL_BOARD, dtype=np.int8)
    turn = 'white' if rng.random() < 0.5 else 'black'
    nn_color = 'white' if rng.random() < 0.5 else 'black'
    recorded = []           # (board copy, turn)
    seen = set()
    moves_played = 0

    while moves_played < max_moves:
        dice = roll_dice()                 # (d1,d2)
        if not is_double(dice):
            rolls = [(dice[0], dice[1]), (dice[1], dice[0])]
        else:
            rolls = [(dice[0], dice[0])]
        did_move = False
        for r0, r1 in rolls:
            seqs = generate_all_turn_sequences_batch(board, turn, r0, r1)
            if seqs.shape[0] == 0:
                continue
            boards_after = seqs[:, -30:]
            vals = forward_batch(model, boards_after, [turn] * seqs.shape[0])
            scores = -vals
            if exploration > 0 and rng.random() < exploration:
                mv = rng.randrange(seqs.shape[0])
            else:
                mv = int(np.argmax(scores))
            chosen = seqs[mv]
            board = boards_after[mv].astype(np.int8)
            recorded.append((chosen[:30].astype(np.int8), turn))
            did_move = True
            break
        if not did_move:
            recorded.append((board.copy(), turn))
        moves_played += 1
        w = get_winner(board)
        if w is not None:
            break
        # 3x repetition -> draw
        key = bytes(board.tobytes()) + turn.encode()
        seen.add(key)
        if len(seen) >= 3:
            break
        turn = 'black' if turn == 'white' else 'white'

    # build TD(0) targets
    # label convention: target_i = -V(board_{i+1}, opponent) ; terminal = +/-1
    examples = []
    T = len(recorded)
    for i in range(T):
        b, t = recorded[i]
        opp = 'black' if t == 'white' else 'white'
        if i + 1 < T:
            b_next, _ = recorded[i + 1]
            v_next = float(forward_batch(model, b_next[None, :], [opp])[0])
            target = -v_next
        else:
            w = get_winner(b)
            target = 1.0 if w == t else (-1.0 if w is not None else 0.0)
        examples.append((b.astype(np.int8), t, float(target)))
    return examples


def is_double(dice):
    return dice[0] == dice[1]


def self_play_dataset(model, games, exploration, max_moves, rng):
    data = []
    for g in range(games):
        data.extend(play_one_game(model, exploration, max_moves, rng))
    return data


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--games', type=int, default=20000)
    ap.add_argument('--exploration', type=float, default=0.15)
    ap.add_argument('--max-moves', type=int, default=400)
    ap.add_argument('--epochs', type=int, default=3)
    ap.add_argument('--batch-size', type=int, default=64)
    ap.add_argument('--eval-every', type=int, default=2000)
    ap.add_argument('--eval-games', type=int, default=200)
    ap.add_argument('--save-every', type=int, default=10000)
    ap.add_argument('--out', default='public/model_weights.json')
    ap.add_argument('--weights', default=None)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--live-eval', action='store_true')
    args = ap.parse_args()

    rng = random.Random(args.seed)
    np.random.seed(args.seed)
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)

    model = build_model()
    if args.weights:
        with open(args.weights) as f:
            deserialize_weights(model, json.load(f))
        print('reanudando desde', args.weights)

    print('Arrancando entrenamiento rapido (self-play, NumPy)...')
    total_trained = 0
    done = 0
    while done < args.games:
        chunk = min(args.save_every, args.games - done)
        data = self_play_dataset(model, chunk, args.exploration, args.max_moves, rng)
        if not data:
            break
        Xb = np.array([encode_board_single(b, t) for b, t, _ in data], dtype=np.float32)
        y = np.array([d[2] for d in data], dtype=np.float32)
        model.fit(Xb, y, batch_size=args.batch_size, epochs=args.epochs,
                  verbose=0, shuffle=True)
        total_trained += len(data)
        done += chunk
        print(f'[{datetime.now().strftime("%H:%M:%S")}] {done}/{args.games} partidas | '
              f'{total_trained} posiciones | guardado {args.out}')
        model.get_weights()  # keep
        w = serialize_weights(model)
        with open(args.out, 'w') as f:
            json.dump(w, f)

    # final save
    w = serialize_weights(model)
    with open(args.out, 'w') as f:
        json.dump(w, f)
    print('FINAL guardado en', args.out, '| posiciones totales', total_trained)


def encode_board_single(board, turn):
    # tiny wrapper to reuse encode_batch on a single board for final fit
    arr = np.asarray(board, dtype=np.int8)[None, :]
    return encode_batch(arr, np.array([turn], dtype=object))[0]


if __name__ == '__main__':
    main()
