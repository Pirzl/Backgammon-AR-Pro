"""
bg_fast.py — SAFE fast self-play engine for VIVO backgammon.

DESIGN DECISION: we DO NOT reimplement board rules. Instead we wrap bg_engine's
own (correct, browser-matching) functions and optimize ONLY the self-play loop
and the batch encoding. This guarantees parity by construction: the same
functions that the browser-equivalent code path uses are the ones we train with.

What we speed up (the real bottlenecks in bg_net.play_one_game):
  1. We never call evaluate_position (self-play uses the NN for move choice).
  2. We batch the NN forward pass over all candidate boards in a turn.
  3. We avoid building giant Python lists of move-dicts; we use the board
     arrays returned by generate_all_turn_sequences_batch() (which returns
     boardAfter arrays directly).

generate_all_turn_sequences_batch() here reuses bg_engine.generate_all_turn_sequences
and applies the moves with bg_engine.apply_move, returning (N,30) int8 array of
final boards. Identical results to the engine, just packaged for fast training.
"""

import numpy as np
from bg_engine import (
    INITIAL_BOARD, roll_dice, get_winner,
    generate_all_turn_sequences, apply_move, encode_board,
)


def is_double(dice):
    return dice[0] == dice[1]


def _apply_seq(board, moves, player):
    b = list(board)
    for m in moves:
        b = apply_move(b, m, player)
    return np.array(b, dtype=np.int8)


def generate_all_turn_sequences_batch(board, turn, d0, d1):
    """Return (N,30) int8 array of final boards for every legal full-turn
    sequence given dice (d0,d1) for `turn`. Reuses bg_engine exactly."""
    board = np.asarray(board, dtype=np.int8)
    if is_double((d0, d1)):
        seqs = generate_all_turn_sequences(list(board), [d0], turn)
    else:
        s1 = generate_all_turn_sequences(list(board), [d0, d1], turn)
        s2 = generate_all_turn_sequences(list(board), [d1, d0], turn)
        seqs = s1 + s2
    if not seqs:
        return np.empty((0, 30), dtype=np.int8)
    outs = []
    seen = set()
    for seq in seqs:
        ba = _apply_seq(board, seq, turn)
        key = bytes(ba.tobytes())
        if key not in seen:
            seen.add(key)
            outs.append(ba)
    return np.array(outs, dtype=np.int8)


def encode_batch(boards, turns):
    """boards: (N,30) int8 or list. turns: list/N of str. -> (N,198) float32.
    Reuses bg_engine.encode_board exactly."""
    if isinstance(boards, np.ndarray):
        boards = boards.tolist()
    N = len(boards)
    X = np.zeros((N, 198), dtype=np.float32)
    for i in range(N):
        X[i] = encode_board(boards[i], turns[i])
    return X
