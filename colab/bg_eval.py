"""
bg_eval.py — internal head-to-head strength comparison.

Plays two models against each other and reports win-rate %.
Also a self-vs-self sanity check (should be ~50/50: proves no color bias / bug).

Usage:
  python bg_eval.py --new ../dist/model_weights.json --base model_300.json \
       --games 500 --self 100 --seed 1
"""
import argparse, json, time, random
import numpy as np
from bg_fast import generate_all_turn_sequences_batch
from bg_train_fast import forward_batch
from bg_net import build_model, deserialize_weights
from bg_engine import INITIAL_BOARD, get_winner


def load_model(path):
    """Reconstruct a Keras model from the serialized JSON weights."""
    model = build_model()
    with open(path) as f:
        deserialize_weights(model, json.load(f))
    return model


def play_eval_game(model_a, model_b, rng, max_moves=400):
    """model_a plays 'white', model_b plays 'black'. Returns 'white'/'black'.

    Each side to move rolls its OWN dice and plays the best legal full-turn
    sequence under its model. Uses bg_fast.generate_all_turn_sequences_batch
    (exact engine) + bg_engine.get_winner (same as the browser)."""
    board = np.array(INITIAL_BOARD, dtype=np.int8)
    turn = 'white'
    for _ in range(max_moves):
        w = get_winner(np.asarray(board))
        if w:
            return w
        d0 = rng.randint(1, 6)
        d2 = rng.randint(1, 6)
        cands = generate_all_turn_sequences_batch(board, turn, d0, d2)
        if cands.shape[0] == 0:
            # no legal move: pass the turn to the opponent
            turn = 'black' if turn == 'white' else 'white'
            continue
        model = model_a if turn == 'white' else model_b
        vals = forward_batch(model, cands, [turn] * len(cands)).reshape(-1)
        # The model predicts P(white wins). White maximizes it; black minimizes it.
        if turn == 'white':
            best = int(np.argmax(vals))
        else:
            best = int(np.argmin(vals))
        board = np.asarray(cands[best], dtype=np.int8)
        turn = 'black' if turn == 'white' else 'white'
    # safety: declare winner by position if max_moves exceeded
    return get_winner(np.asarray(board)) or 'white'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--new', required=True)
    ap.add_argument('--base', required=True)
    ap.add_argument('--games', type=int, default=500)
    ap.add_argument('--self', type=int, default=100)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    m_new = load_model(args.new)
    m_base = load_model(args.base)
    print(f'NEW  <- {args.new}')
    print(f'BASE <- {args.base}')

    # 1) NEW (white) vs BASE (black)
    t = time.time()
    nw = nb = ns = 0
    for g in range(args.games):
        w = play_eval_game(m_new, m_base, rng)
        if w == 'white':
            nw += 1
        elif w == 'black':
            nb += 1
        else:
            ns += 1
        if (g + 1) % 100 == 0:
            print(f'  [{g+1}/{args.games}] NEW%(white)={100*nw/(g+1):.1f} '
                  f'BASE%(black)={100*nb/(g+1):.1f}')
    print(f'[NEW vs BASE] {args.games} games in {time.time()-t:.0f}s | '
          f'NEW(white) wins {nw} ({100*nw/args.games:.1f}%) | '
          f'BASE(black) wins {nb} ({100*nb/args.games:.1f}%) | '
          f'stalemate {ns}')
    new_vs_base = 100 * nw / args.games

    # 2) self-vs-self sanity (NEW vs NEW) -> must be ~50/50
    if args.self > 0:
        t = time.time()
        w1 = w2 = 0
        for g in range(args.self):
            w = play_eval_game(m_new, m_new, rng)
            if w == 'white':
                w1 += 1
            elif w == 'black':
                w2 += 1
        print(f'[NEW vs NEW sanity] {args.self} games in {time.time()-t:.0f}s | '
              f'white {w1} ({100*w1/args.self:.1f}%) '
              f'black {w2} ({100*w2/args.self:.1f}%) -> ~50% means no bias/bug')

    if args.out:
        with open(args.out, 'w') as f:
            json.dump({'new_vs_base_pct': new_vs_base, 'games': args.games}, f)


if __name__ == '__main__':
    main()
