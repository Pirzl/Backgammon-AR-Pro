"""
bg_net.py — Wide-net (198->256->128->64->1) TD(0) trainer for VIVO backgammon,
running on TensorFlow GPU in Colab.

Mirrors EXACTLY src/features/ai-worker/nn-model.ts:
  - same architecture (buildLayers / NET_ARCH)
  - same serialize/deserialize weight format ({shape, data} layers)
  - same encode_board (from bg_engine.py, copy of nn-model.ts encodeBoard)
  - same training (MSE, LR 5e-4, clipnorm 1.0, batch 64, shuffle)
  - same label convention as self-play.ts --label=td0:
        target_i = -V(board_{i+1}, opponent); terminal = +/-1
  - same move selection as self-play.ts / tournament.ts:
        score(move) = -V(boardAfter, opponent)  [side-to-move convention]

Output: public/model_weights.json in the EXACT shape the browser loads, so no
browser code change is needed.
"""

import json
import math
import os
import random
from datetime import datetime

import numpy as np
import tensorflow as tf
from bg_engine import (
    INITIAL_BOARD, get_winner, encode_board, roll_dice,
    pick_best_full_turn, evaluate_position,
)

# ---- architecture ----
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
    out = []
    for w in model.get_weights():
        out.append({'shape': list(w.shape), 'data': w.reshape(-1).tolist()})
    return out


def deserialize_weights(model, weights):
    tensors = [np.array(w['data'], dtype=np.float32).reshape(w['shape']) for w in weights]
    model.set_weights(tensors)


def forward(model, boards, turns):
    """Batch forward pass. boards: list[30-int]; turns: list['white'/'black'].
    Returns np.array of raw predictions (side-to-move value in [-1,1])."""
    xs = np.array([encode_board(b, t) for b, t in zip(boards, turns)], dtype=np.float32)
    return model.predict(xs, batch_size=512, verbose=0).reshape(-1)


# ---- self-play ----
def play_one_game(model, opponent, exploration, max_moves, rng):
    board = list(INITIAL_BOARD)
    turn = 'white' if rng.random() < 0.5 else 'black'
    nn_color = 'white' if rng.random() < 0.5 else 'black'
    recorded = []  # (board, turn)
    seen = set()
    moves_played = 0

    while moves_played < max_moves:
        if get_winner(board) is not None:
            break
        recorded.append((list(board), turn))
        pos_key = f'{turn}:{",".join(str(x) for x in board)}'
        is_repeat = pos_key in seen
        seen.add(pos_key)

        dice = roll_dice()
        is_nn = (opponent == 'self') or (turn == nn_color)

        def evaluator(afters, mover, opp):
            # after a full turn it is opp's turn; score = -V(after, opp)
            vals = forward(model, afters, [opp] * len(afters))
            return (-vals * 50.0).tolist()

        if not is_nn:
            def evaluator(afters, mover, opp):
                return [evaluate_position(b, mover, 2.0) for b in afters]

        eps = 1.0 if is_repeat else (exploration if is_nn else 0.0)
        picked = pick_best_full_turn(board, dice, turn, evaluator, max_sequences=192, epsilon=eps, rng=rng.random)
        seq = picked['sequence']
        if seq:
            for m in seq:
                board = apply_move_local(board, m, turn)
            moves_played += len(seq)
        turn = 'black' if turn == 'white' else 'white'

    return board, recorded


def apply_move_local(board, move, player):
    # delegate to bg_engine.apply_move
    from bg_engine import apply_move
    return apply_move(board, move, player)


def make_examples(model, board, recorded, rng):
    winner = get_winner(board)
    if winner is None:
        return []
    n = len(recorded)
    if n == 0:
        return []
    # next-board bootstraps: position i's target uses value of position i+1
    next_boards = [recorded[i][0] for i in range(1, n)]
    next_turns = [recorded[i][1] for i in range(1, n)]
    preds = forward(model, next_boards, next_turns) if n > 1 else np.array([])
    examples = []
    for i in range(n):
        player_won = recorded[i][1] == winner
        if i == n - 1:
            target = 1.0 if player_won else -1.0
        else:
            target = -float(preds[i])  # -V(next position, next player-as-opponent)
        examples.append((recorded[i][0], recorded[i][1], float(max(-1.0, min(1.0, target)))))
    return examples


def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--games', type=int, default=100000)
    p.add_argument('--opponent', choices=['self', 'heuristic'], default='heuristic')
    p.add_argument('--label', choices=['td0', 'outcome'], default='td0')
    p.add_argument('--exploration', type=float, default=0.15)
    p.add_argument('--max-moves', type=int, default=400)
    p.add_argument('--epochs', type=int, default=3)
    p.add_argument('--eval-every', type=int, default=250)
    p.add_argument('--eval-games', type=int, default=200)
    p.add_argument('--save-every', type=int, default=50)
    p.add_argument('--stop-rate', type=float, default=0.60)
    p.add_argument('--stop-streak', type=int, default=2)
    p.add_argument('--out', default='public/model_weights.json')
    p.add_argument('--weights', default=None, help='resume from this weights json')
    p.add_argument('--seed', type=int, default=1)
    a = p.parse_args()

    rng = random.Random(a.seed)
    print('BACKEND =', tf.config.list_physical_devices('GPU'))

    out_dir = os.path.dirname(a.out)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    model = build_model()
    if a.weights and os.path.exists(a.weights):
        raw = json.load(open(a.weights))
        deserialize_weights(model, raw['weights'])
        print(f'[Resume] loaded {len(raw["weights"])} layers from {a.weights}')

    trained_count = 0
    consecutive_pass = 0
    nn_color = None  # unused

    for game in range(1, a.games + 1):
        board, recorded = play_one_game(model, a.opponent, a.exploration, a.max_moves, rng)
        examples = make_examples(model, board, recorded, rng)
        if examples:
            xs = np.array([encode_board(b, t) for b, t, _ in examples], dtype=np.float32)
            ys = np.array([[target] for _, _, target in examples], dtype=np.float32)
            model.fit(xs, ys, epochs=a.epochs, batch_size=min(64, len(examples)),
                      shuffle=True, verbose=0)
            trained_count += len(examples)

        winner = get_winner(board)
        print(json.dumps({
            'event': 'game', 'game': game, 'winner': winner,
            'positions': len(examples), 'trainedCount': trained_count,
        }), flush=True)

        if game % a.save_every == 0:
            payload = {
                'id': 'current', 'weights': serialize_weights(model),
                'trained_count': trained_count, 'games_played': game,
                'updated_at': datetime.utcnow().isoformat() + 'Z',
            }
            json.dump(payload, open(a.out, 'w'))
            print(f'[Persist] saved {len(payload["weights"])} layers -> {a.out}')

        if a.eval_every > 0 and game % a.eval_every == 0:
            rate = run_tournament(model, a.eval_games, rng)
            print(json.dumps({'event': 'eval', 'game': game, 'rate': rate}), flush=True)
            if rate >= a.stop_rate:
                consecutive_pass += 1
                if consecutive_pass >= a.stop_streak:
                    print(f'[AutoStop] {consecutive_pass} evals >= {a.stop_rate} at game {game}')
                    payload = {
                        'id': 'current', 'weights': serialize_weights(model),
                        'trained_count': trained_count, 'games_played': game,
                        'updated_at': datetime.utcnow().isoformat() + 'Z',
                    }
                    json.dump(payload, open(a.out, 'w'))
                    return
            else:
                consecutive_pass = 0

    payload = {
        'id': 'current', 'weights': serialize_weights(model),
        'trained_count': trained_count, 'games_played': a.games,
        'updated_at': datetime.utcnow().isoformat() + 'Z',
    }
    json.dump(payload, open(a.out, 'w'))
    print('[Done] final weights saved')


def run_tournament(model, n_games, rng):
    """NN (pure) vs heuristic, identical to tournament.ts."""
    red_wins = 0
    decisive = 0
    for _ in range(n_games):
        board = list(INITIAL_BOARD)
        turn = 'white' if rng.random() < 0.5 else 'black'
        red_color = 'white' if rng.random() < 0.5 else 'black'
        moves = 0
        while moves < 500:
            winner = get_winner(board)
            if winner:
                break
            dice = roll_dice()

            def red_eval(afters, mover, opp):
                vals = forward(model, afters, [opp] * len(afters))
                return (-vals * 50.0).tolist()

            def heur_eval(afters, mover, opp):
                return [evaluate_position(b, mover, 2.0) for b in afters]

            if turn == red_color:
                picked = pick_best_full_turn(board, dice, turn, red_eval, max_sequences=96, epsilon=0, rng=rng.random)
            else:
                picked = pick_best_full_turn(board, dice, turn, heur_eval, max_sequences=96, epsilon=0, rng=rng.random)
            seq = picked['sequence']
            if seq:
                for m in seq:
                    board = apply_move_local(board, m, turn)
            moves += 1
            turn = 'black' if turn == 'white' else 'white'
        if winner == red_color:
            red_wins += 1
        if winner is not None:
            decisive += 1
    return red_wins / decisive if decisive else 0.0


if __name__ == '__main__':
    main()
