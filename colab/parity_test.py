"""parity_test.py — verify bg_fast.py is a 1:1 port of bg_engine.py.

bg_engine.generate_all_turn_sequences(board, dice, player, used_dice)
  dice = LIST of dice (e.g. [3,1]); returns LIST OF MOVE-SEQUENCES.
bg_fast.generate_all_turn_sequences_batch(board, turn, d0, d1)
  returns boardAfter directly (col 30-59).

To compare: apply bg_engine's move-sequences with its own apply_move to get
boardAfter, then compare the SET of resulting boards.
"""
import numpy as np
from bg_engine import (
    INITIAL_BOARD, generate_all_turn_sequences as eng_seqs,
    apply_move as eng_apply, encode_board as eng_enc,
)
from bg_fast import (
    generate_all_turn_sequences_batch as fast_seqs, encode_batch as fast_enc,
)


def _apply_seq(board, moves, player):
    b = list(board)
    for m in moves:
        b = eng_apply(b, m, player)
    return np.array(b, dtype=np.int8)


def test_sequences(rng_seed=0):
    rng = np.random.default_rng(rng_seed)
    mism = 0
    for _ in range(300):
        board = list(INITIAL_BOARD)
        turn = 'white' if rng.random() < 0.5 else 'black'
        d = (int(rng.integers(1, 7)), int(rng.integers(1, 7)))
        if d[0] == d[1]:
            se = eng_seqs(list(board), [d[0]], turn)
            sf = fast_seqs(np.array(board, dtype=np.int8), turn, d[0], d[0])
            boards_e = set(bytes(_apply_seq(board, seq, turn).tobytes()) for seq in se)
        else:
            boards_e = set()
            for d0, d1 in ((d[0], d[1]), (d[1], d[0])):
                se = eng_seqs(list(board), [d0, d1], turn)
                for seq in se:
                    boards_e.add(bytes(_apply_seq(board, seq, turn).tobytes()))
            sf = fast_seqs(np.array(board, dtype=np.int8), turn, d[0], d[1])
        boards_f = set(bytes(sf[i][-30:].tobytes()) for i in range(sf.shape[0]))
        if boards_e != boards_f:
            mism += 1
    return mism


def test_encode(rng_seed=1):
    rng = np.random.default_rng(rng_seed)
    mism = 0
    for _ in range(200):
        board = list(INITIAL_BOARD)
        turn = 'white' if rng.random() < 0.5 else 'black'
        d = (int(rng.integers(1, 7)), int(rng.integers(1, 7)))
        if d[0] == d[1]:
            se = eng_seqs(list(board), [d[0]], turn)
            sf = fast_seqs(np.array(board, dtype=np.int8), turn, d[0], d[0])
        else:
            se = eng_seqs(list(board), [d[0], d[1]], turn)
            sf = fast_seqs(np.array(board, dtype=np.int8), turn, d[0], d[1])
        if not se or sf.shape[0] == 0:
            continue
        idx = int(rng.integers(sf.shape[0]))
        bf = sf[idx][-30:].astype(np.int8)
        found = None
        for seq in se:
            ba = _apply_seq(board, seq, turn)
            if np.array_equal(ba, bf):
                found = ba
                break
        if found is None:
            continue
        te = eng_enc(list(found), turn)
        tf_ = fast_enc(bf[None, :], np.array([turn], dtype=object))[0]
        if not np.allclose(te, tf_, atol=1e-6):
            mism += 1
    return mism


if __name__ == '__main__':
    ms = test_sequences()
    me = test_encode()
    print(f'sequence mismatches: {ms}/300')
    print(f'encode mismatches:   {me}/200')
    if ms == 0 and me == 0:
        print('PARITY OK — bg_fast is a faithful port; safe to train.')
    else:
        print('PARITY FAILED — DO NOT TRAIN until fixed.')
