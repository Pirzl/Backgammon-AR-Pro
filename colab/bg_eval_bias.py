"""Fast bias diagnostic: NEW model vs a RANDOM opponent, both colors."""
import random
import json
import numpy as np
from bg_fast import generate_all_turn_sequences_batch, encode_batch
from bg_train_fast import forward_batch
from bg_net import build_model, deserialize_weights
from bg_engine import INITIAL_BOARD, get_winner


def load_model(path):
    m = build_model()
    with open(path) as f:
        deserialize_weights(m, json.load(f))
    return m


def random_move(board, turn, rng):
    d0 = rng.randint(1, 6)
    d2 = rng.randint(1, 6)
    cands = generate_all_turn_sequences_batch(np.asarray(board, dtype=np.int8), turn, d0, d2)
    if cands.shape[0] == 0:
        return None
    return cands[rng.randrange(cands.shape[0])]


def model_move(model, board, turn, rng):
    d0 = rng.randint(1, 6)
    d2 = rng.randint(1, 6)
    cands = generate_all_turn_sequences_batch(np.asarray(board, dtype=np.int8), turn, d0, d2)
    if cands.shape[0] == 0:
        return None
    vals = forward_batch(model, cands, [turn] * len(cands)).reshape(-1)
    return cands[int(np.argmax(vals))]


def play(model, model_color, rng, max_moves=300):
    board = np.array(INITIAL_BOARD, dtype=np.int8)
    turn = 'white'
    for _ in range(max_moves):
        w = get_winner(np.asarray(board))
        if w:
            return w
        if model_color == turn:
            nxt = model_move(model, board, turn, rng)
        else:
            nxt = random_move(board, turn, rng)
        if nxt is None:
            turn = 'black' if turn == 'white' else 'white'
            continue
        board = np.asarray(nxt, dtype=np.int8)
        turn = 'black' if turn == 'white' else 'white'
    return get_winner(np.asarray(board)) or 'white'


def main():
    import json, argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--games', type=int, default=200)
    ap.add_argument('--seed', type=int, default=3)
    a = ap.parse_args()
    rng = random.Random(a.seed)
    m = load_model(a.model)
    # model as WHITE vs random BLACK
    w_white = sum(1 for _ in range(a.games) if play(m, 'white', rng) == 'white')
    # model as BLACK vs random WHITE
    w_black = sum(1 for _ in range(a.games) if play(m, 'black', rng) == 'black')
    print(f'[{a.games} games each]')
    print(f'  MODEL(white) vs RANDOM(black): {w_white}/{a.games} = {100*w_white/a.games:.1f}%')
    print(f'  MODEL(black) vs RANDOM(white): {w_black}/{a.games} = {100*w_black/a.games:.1f}%')
    print('  (if both ~100%: no color bias in model; the 77/23 was eval-harness artifact)')


if __name__ == '__main__':
    main()
