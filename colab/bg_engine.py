"""
bg_engine.py — Pure-Python port of the VIVO backgammon engine.

Ported 1:1 from the TypeScript sources so a network trained in this Python
pipeline plays by the EXACT same rules the browser uses:

  - entities/game/constants.ts, rules.ts, full-turn-generator.ts, utils.ts
  - features/ai-worker/expectimax.ts   (evaluatePosition + all helpers)
  - features/ai-worker/nn-model.ts      (encodeBoard)
  - features/ai-worker/training/move-picker.ts (pickBestFullTurn)
  - features/ai-worker/training/self-play.ts (rollDice, getWinner, td0 labels)

Board encoding: list of 30 ints.
  indices 1..24  = points (positive = white checkers, negative = black)
  index 26       = white bar,  index 27 = black bar
  index 28       = white off,  index 29 = black off

No TensorFlow dependency here — only the move generator, heuristic and encoders.
The network lives in bg_net.py.
"""

# ---------------------------------------------------------------------------
# constants (entities/game/constants.ts)
# ---------------------------------------------------------------------------
BAR_WHITE = 26
BAR_BLACK = 27
OFF_WHITE = 28
OFF_BLACK = 29

WHITE_DIRECTION = -1
BLACK_DIRECTION = 1

WHITE_HOME_START, WHITE_HOME_END = 1, 6
BLACK_HOME_START, BLACK_HOME_END = 19, 24

INITIAL_BOARD = [0] * 30
INITIAL_BOARD[1] = -2
INITIAL_BOARD[6] = 5
INITIAL_BOARD[8] = 3
INITIAL_BOARD[12] = -5
INITIAL_BOARD[13] = 5
INITIAL_BOARD[17] = -3
INITIAL_BOARD[19] = -5
INITIAL_BOARD[24] = 2


# ---------------------------------------------------------------------------
# rules.ts helpers
# ---------------------------------------------------------------------------
def get_bar_index(player):
    return BAR_WHITE if player == 'white' else BAR_BLACK


def get_off_index(player):
    return OFF_WHITE if player == 'white' else OFF_BLACK


def get_direction(player):
    return WHITE_DIRECTION if player == 'white' else BLACK_DIRECTION


def get_home_board(player):
    return (WHITE_HOME_START, WHITE_HOME_END) if player == 'white' else (BLACK_HOME_START, BLACK_HOME_END)


def has_checkers_on_bar(board, player):
    v = board[get_bar_index(player)]
    return v > 0 if player == 'white' else v < 0


def all_checkers_home(board, player):
    home_start, home_end = get_home_board(player)
    sign = 1 if player == 'white' else -1
    if has_checkers_on_bar(board, player):
        return False
    for i in range(1, 25):
        c = board[i]
        if not c:
            continue
        own = (sign > 0 and c > 0) or (sign < 0 and c < 0)
        if not own:
            continue
        if not (home_start <= i <= home_end):
            return False
    return True


def can_bear_off(board, frm, die, player):
    if not all_checkers_home(board, player):
        return False
    direction = get_direction(player)
    simulated_target = frm + (die * direction)
    is_exact_or_over = simulated_target < 1 if player == 'white' else simulated_target > 24
    if not is_exact_or_over:
        return False
    is_exact = simulated_target == 0 if player == 'white' else simulated_target == 25
    if is_exact:
        return True
    if player == 'white':
        for i in range(frm + 1, WHITE_HOME_END + 1):
            if board[i] is not None and board[i] > 0:
                return False
        return True
    else:
        for i in range(frm - 1, BLACK_HOME_START - 1, -1):
            if board[i] is not None and board[i] < 0:
                return False
        return True


def get_available_dice(dice, used_dice):
    available = list(dice)
    for used in used_dice:
        if used in available:
            available.remove(used)
    return available


def is_valid_move(state, move):
    board = state['board']
    turn = state['turn']
    dice = state['dice']
    used_dice = state['usedDice']
    frm, to, die = move['from'], move['to'], move['die']
    sign = 1 if turn == 'white' else -1

    available = get_available_dice(dice, used_dice)
    if die not in available:
        return False

    bar_index = get_bar_index(turn)
    off_index = get_off_index(turn)

    if has_checkers_on_bar(board, turn) and frm != bar_index:
        return False

    from_checkers = board[frm] if frm < len(board) else 0
    if not from_checkers or (sign > 0 and from_checkers <= 0) or (sign < 0 and from_checkers >= 0):
        return False

    if frm == bar_index:
        expected_to = 25 - die if turn == 'white' else die
    elif to == off_index:
        return can_bear_off(board, frm, die, turn)
    else:
        expected_to = frm + (die * get_direction(turn))

    if expected_to != to:
        return False
    if expected_to < 1 or expected_to > 24:
        return False

    to_checkers = board[to] if to < len(board) else 0
    if to_checkers and ((sign > 0 and to_checkers <= -2) or (sign < 0 and to_checkers >= 2)):
        return False
    return True


def get_valid_moves(state):
    board = state['board']
    turn = state['turn']
    dice = state['dice']
    used_dice = state['usedDice']
    moves = []
    available = get_available_dice(dice, used_dice)
    bar_index = get_bar_index(turn)
    off_index = get_off_index(turn)

    origins = [bar_index] + list(range(1, 25))
    for frm in origins:
        checkers = board[frm] if frm < len(board) else 0
        if not checkers:
            continue
        is_ours = (turn == 'white' and checkers > 0) or (turn == 'black' and checkers < 0)
        if not is_ours:
            continue
        unique_dice = list(set(available))
        for die in unique_dice:
            if frm == bar_index:
                to = 25 - die if turn == 'white' else die
            else:
                to = frm + (die * get_direction(turn))
            if 1 <= to <= 24:
                if is_valid_move(state, {'from': frm, 'to': to, 'die': die}):
                    moves.append({'from': frm, 'to': to, 'die': die})
            if all_checkers_home(board, turn):
                if can_bear_off(board, frm, die, turn):
                    moves.append({'from': frm, 'to': off_index, 'die': die})
    return moves


def apply_move(board, move, player):
    new_board = list(board)
    frm, to = move['from'], move['to']
    sign = 1 if player == 'white' else -1

    from_value = new_board[frm] if frm < len(new_board) else 0
    new_board[frm] = from_value - sign

    is_off_move = to == OFF_WHITE or to == OFF_BLACK
    if not is_off_move:
        dest_checkers = new_board[to] if to < len(new_board) else 0
        if dest_checkers and ((sign > 0 and dest_checkers == -1) or (sign < 0 and dest_checkers == 1)):
            opponent_bar = get_bar_index('black' if player == 'white' else 'white')
            bar_value = new_board[opponent_bar] if opponent_bar < len(new_board) else 0
            new_board[opponent_bar] = bar_value + dest_checkers
            new_board[to] = 0

    to_value = new_board[to] if to < len(new_board) else 0
    new_board[to] = to_value + sign
    return new_board


# ---------------------------------------------------------------------------
# full-turn-generator.ts
# ---------------------------------------------------------------------------
MAX_SEQUENCES = 6000


def _board_key(board):
    return ','.join(str(x) for x in board)


def generate_all_turn_sequences(board, dice, player, used_dice=None, max_sequences=MAX_SEQUENCES):
    if used_dice is None:
        used_dice = []
    results = []
    seen_final = set()

    def recurse(current_board, current_moves, current_used):
        if len(results) >= max_sequences:
            return
        available = get_available_dice(dice, current_used)
        if len(available) == 0:
            key = _board_key(current_board)
            if key not in seen_final:
                seen_final.add(key)
                results.append(list(current_moves))
            return

        state = {
            'board': current_board,
            'turn': player,
            'dice': dice,
            'usedDice': current_used,
        }
        legal_moves = get_valid_moves(state)
        if len(legal_moves) == 0:
            key = _board_key(current_board)
            if key not in seen_final:
                seen_final.add(key)
                results.append(list(current_moves))
            return

        moved = False
        seen_after = set()
        for move in legal_moves:
            if len(results) >= max_sequences:
                return
            new_board = apply_move(current_board, move, player)
            after_key = _board_key(new_board)
            if after_key in seen_after:
                continue
            seen_after.add(after_key)
            current_moves.append(move)
            current_used.append(move['die'])
            moved = True
            recurse(new_board, current_moves, current_used)
            current_moves.pop()
            current_used.pop()
        if not moved:
            key = _board_key(current_board)
            if key not in seen_final:
                seen_final.add(key)
                results.append(list(current_moves))

    recurse(list(board), [], list(used_dice))
    return results


# ---------------------------------------------------------------------------
# self-play.ts helpers
# ---------------------------------------------------------------------------
def roll_dice():
    d1 = 1 + (0 if False else __import__('random').randrange(6))
    d2 = 1 + __import__('random').randrange(6)
    if d1 == d2:
        return [d1, d1, d1, d1]
    return [d1, d2]


def get_winner(board):
    if abs(board[OFF_WHITE]) >= 15:
        return 'white'
    if abs(board[OFF_BLACK]) >= 15:
        return 'black'
    return None


# ---------------------------------------------------------------------------
# nn-model.ts encodeBoard (198-vector)
# ---------------------------------------------------------------------------
def encode_board(board, turn):
    fv = [0.0] * 198
    sign = 1 if turn == 'white' else -1
    opp_sign = -sign

    for point in range(1, 25):
        checkers = board[point] if point < len(board) else 0
        base = (point - 1) * 8
        my_checkers = (max(0, checkers) if sign == 1 else max(0, -checkers))
        if my_checkers >= 1:
            fv[base + 0] = 1
        if my_checkers >= 2:
            fv[base + 1] = 1
        if my_checkers >= 3:
            fv[base + 2] = 1
        if my_checkers > 3:
            fv[base + 3] = (my_checkers - 3) / 2.0
        opp_c = (max(0, checkers) if opp_sign == 1 else max(0, -checkers))
        if opp_c >= 1:
            fv[base + 4] = 1
        if opp_c >= 2:
            fv[base + 5] = 1
        if opp_c >= 3:
            fv[base + 6] = 1
        if opp_c > 3:
            fv[base + 7] = (opp_c - 3) / 2.0

    my_bar = get_bar_index(turn)
    opp_bar = get_bar_index('black' if turn == 'white' else 'white')
    my_off = get_off_index(turn)
    opp_off = get_off_index('black' if turn == 'white' else 'white')

    fv[192] = abs(board[my_bar] if my_bar < len(board) else 0) / 2.0
    fv[193] = abs(board[opp_bar] if opp_bar < len(board) else 0) / 2.0
    fv[194] = abs(board[my_off] if my_off < len(board) else 0) / 15.0
    fv[195] = abs(board[opp_off] if opp_off < len(board) else 0) / 15.0
    fv[196] = 1.0 if turn == 'white' else 0.0
    fv[197] = 1.0 if turn == 'black' else 0.0
    return fv


# ---------------------------------------------------------------------------
# expectimax.ts evaluatePosition (static heuristic, ported verbatim)
# ---------------------------------------------------------------------------
EXPECTIMAX_MAX = 50

WEIGHTS = {
    'pipCount': -0.6,
    'prime': 1.2,
    'anchor': 0.9,
    'blotRisk': 2.8,
    'boardStrength': 0.8,
    'homeBoard': 0.7,
    'raceMode': 1.2,
    'hitBonus': 1.2,
    'bearOff': 2.2,
    'contactBearOff': 1.4,
}


def _clamp_score(value):
    if not isinstance(value, (int, float)) or value != value:  # NaN check
        return 0
    if value > EXPECTIMAX_MAX:
        return EXPECTIMAX_MAX
    if value < -EXPECTIMAX_MAX:
        return -EXPECTIMAX_MAX
    return value


def _evaluate_home_board(board, player):
    start, end = get_home_board(player)
    sign = 1 if player == 'white' else -1
    points = 0
    for i in range(start, end + 1):
        c = board[i] if i < len(board) else 0
        if (sign > 0 and c >= 2) or (sign < 0 and c <= -2):
            points += 1
    return points


def _calculate_pip_count(board, player):
    sign = 1 if player == 'white' else -1
    bar_index = get_bar_index(player)
    pip = 0
    for point in range(1, 25):
        c = board[point] if point < len(board) else 0
        if not c:
            continue
        is_ours = (sign > 0 and c > 0) or (sign < 0 and c < 0)
        if not is_ours:
            continue
        count = abs(c)
        distance = point if player == 'white' else (25 - point)
        pip += count * distance
    bar_checkers = abs(board[bar_index] if bar_index < len(board) else 0)
    if bar_checkers > 0:
        pip += bar_checkers * 25
    return pip


def _calculate_pip_diff(board, player):
    pips = _calculate_pip_count(board, player)
    opp = 'black' if player == 'white' else 'white'
    opp_pips = _calculate_pip_count(board, opp)
    return pips - opp_pips


def _calculate_prime_score(board, player):
    sign = 1 if player == 'white' else -1
    score = 0
    consecutive = 0
    for i in range(1, 25):
        c = board[i] if i < len(board) else 0
        is_player_point = (sign > 0 and c >= 2) or (sign < 0 and c <= -2)
        if is_player_point:
            consecutive += 1
        else:
            if consecutive >= 3:
                if consecutive == 3:
                    score += 0.5
                elif consecutive == 4:
                    score += 1.2
                elif consecutive == 5:
                    score += 2.0
                elif consecutive >= 6:
                    score += 4.0
            consecutive = 0
    if consecutive >= 3:
        if consecutive == 3:
            score += 0.5
        elif consecutive == 4:
            score += 1.2
        elif consecutive == 5:
            score += 2.0
        elif consecutive >= 6:
            score += 4.0
    return score


def _calculate_anchor_score(board, player):
    sign = 1 if player == 'white' else -1
    opp = 'black' if player == 'white' else 'white'
    opp_home_start, opp_home_end = get_home_board(opp)
    score = 0
    for i in range(opp_home_start, opp_home_end + 1):
        c = board[i] if i < len(board) else 0
        is_anchor = (sign > 0 and c >= 2) or (sign < 0 and c <= -2)
        if is_anchor:
            distance = i if player == 'white' else (25 - i)
            if distance == 20:
                score += 1.2
            elif distance == 21:
                score += 1.0
            elif distance == 22:
                score += 0.7
            elif distance == 23:
                score += 0.4
            elif distance == 24:
                score += 0.2
    return score


def _calculate_blot_risk(board, player):
    sign = 1 if player == 'white' else -1
    opp = 'black' if player == 'white' else 'white'
    opp_dir = get_direction(opp)
    score = 0
    for i in range(1, 25):
        c = board[i] if i < len(board) else 0
        if (sign > 0 and c == 1) or (sign < 0 and c == -1):
            for pip in range(1, 7):
                threat = i - opp_dir * pip
                if 1 <= threat <= 24:
                    opp_c = board[threat] if threat < len(board) else 0
                    if (sign > 0 and opp_c < 0) or (sign < 0 and opp_c > 0):
                        score += (0.3 + (6 - pip) * 0.1)
            opp_bar = get_bar_index(opp)
            opp_bar_count = abs(board[opp_bar] if opp_bar < len(board) else 0)
            if opp_bar_count > 0:
                if player == 'white' and 1 <= i <= 6:
                    score += 0.5
                if player == 'black' and 19 <= i <= 24:
                    score += 0.5
    return score


def _count_trapped_checkers(board, player):
    opp = 'black' if player == 'white' else 'white'
    sign = 1 if opp == 'white' else -1
    direction = get_direction(opp)
    trapped = 0
    for point in range(1, 25):
        c = board[point] if point < len(board) else 0
        is_opp_here = (sign > 0 and c > 0) or (sign < 0 and c < 0)
        if not is_opp_here:
            continue
        consecutive_wall = 0
        for step in range(1, 7):
            ahead = point + step * direction
            if ahead < 1 or ahead > 24:
                break
            ahead_c = board[ahead] if ahead < len(board) else 0
            is_our_point = (player == 'white' and ahead_c >= 2) or (player == 'black' and ahead_c <= -2)
            if is_our_point:
                consecutive_wall += 1
            else:
                break
        if consecutive_wall >= 3:
            trapped += abs(c)
    return trapped


def _count_deep_anchors(board, player):
    opp_home_start, opp_home_end = get_home_board('black' if player == 'white' else 'white')
    sign = 1 if player == 'white' else -1
    count = 0
    for i in range(opp_home_start, opp_home_end + 1):
        c = board[i] if i < len(board) else 0
        if (sign > 0 and c >= 2) or (sign < 0 and c <= -2):
            count += 1
    return count


def _get_game_plan(board, player):
    if _is_race_mode(board):
        return 'race'
    opp = 'black' if player == 'white' else 'white'
    prime_score = _calculate_prime_score(board, player)
    opp_prime = _calculate_prime_score(board, opp)
    my_anchors = _calculate_anchor_score(board, player)
    opp_anchors = _calculate_anchor_score(board, opp)
    my_home = _evaluate_home_board(board, player)
    opp_bar = get_bar_index(opp)
    opp_on_bar = abs(board[opp_bar] if opp_bar < len(board) else 0) > 0
    has_strong_prime = prime_score >= 1.5
    has_good_anchors = my_anchors >= 1.0
    if opp_on_bar and my_home >= 3:
        return 'blitz'
    if has_strong_prime and opp_prime < prime_score:
        return 'prime'
    if has_good_anchors and opp_anchors < my_anchors:
        return 'holding'
    deep = _count_deep_anchors(board, player)
    opp_far = _calculate_pip_diff(board, player) > 40
    if deep >= 2 and opp_far:
        return 'backgame'
    return 'mixed'


def _calculate_conditional_hit_bonus(board, player):
    opp = 'black' if player == 'white' else 'white'
    opp_bar = get_bar_index(opp)
    opp_on_bar = abs(board[opp_bar] if opp_bar < len(board) else 0)
    if opp_on_bar == 0:
        return 0
    bonus = opp_on_bar * WEIGHTS['hitBonus']
    my_risk = _calculate_blot_risk(board, player)
    if my_risk > 1.5:
        bonus *= 0.5
    my_strength = _evaluate_home_board(board, player)
    strength_mult = 0.8 + (my_strength / 6) * 0.7
    return bonus * strength_mult


def _is_race_mode(board):
    max_white = 0
    min_black = 25
    for i in range(1, 25):
        c = board[i] if i < len(board) else 0
        if c > 0:
            max_white = max(max_white, i)
        if c < 0:
            min_black = min(min_black, i)
    if (board[BAR_WHITE] if BAR_WHITE < len(board) else 0) > 0:
        return False
    if (board[BAR_BLACK] if BAR_BLACK < len(board) else 0) < 0:
        return False
    return max_white < min_black


def evaluate_position(board, ai_player, strategy_intensity=1):
    opp = 'black' if ai_player == 'white' else 'white'
    sign = 1 if ai_player == 'white' else -1

    ai_off = get_off_index(ai_player)
    opp_off = get_off_index(opp)
    ai_born = abs(board[ai_off] if ai_off < len(board) else 0)
    opp_born = abs(board[opp_off] if opp_off < len(board) else 0)
    if ai_born == 15:
        return 100.0
    if opp_born == 15:
        return -100.0

    pip_diff = _calculate_pip_diff(board, ai_player)
    ai_all_home = all_checkers_home(board, ai_player)

    if _is_race_mode(board):
        score = 0
        score += pip_diff * WEIGHTS['pipCount'] * WEIGHTS['raceMode'] * 0.1
        bear_off_weight = WEIGHTS['bearOff'] * 2 if ai_all_home else WEIGHTS['bearOff']
        score += (ai_born - opp_born) * bear_off_weight
        return _clamp_score(score)

    intensity = min(max(strategy_intensity, 1), 2)
    score = 0
    game_plan = _get_game_plan(board, ai_player)
    pip_weight = WEIGHTS['pipCount'] * 0.05
    prime_weight = WEIGHTS['prime'] * intensity
    anchor_weight = WEIGHTS['anchor'] * intensity
    blot_weight = WEIGHTS['blotRisk'] * intensity
    hit_mult = 1.0

    if game_plan == 'prime':
        prime_weight *= 1.4
        pip_weight *= 0.7
    elif game_plan in ('attack', 'blitz'):
        hit_mult = 1.7 if game_plan == 'blitz' else 1.4
        blot_weight *= 0.8
    elif game_plan == 'holding':
        anchor_weight *= 1.4
    elif game_plan == 'backgame':
        anchor_weight *= 1.6
        blot_weight *= 0.6
        hit_mult = 1.6

    my_bar = get_bar_index(ai_player)
    opp_bar = get_bar_index(opp)
    my_bar_count = abs(board[my_bar] if my_bar < len(board) else 0)
    opp_bar_count = abs(board[opp_bar] if opp_bar < len(board) else 0)
    if my_bar_count > 0:
        opp_home = _evaluate_home_board(board, opp)
        score -= my_bar_count * (3 + opp_home)
    if opp_bar_count > 0:
        my_home = _evaluate_home_board(board, ai_player)
        score += opp_bar_count * (1.5 + my_home * 0.5)

    score += pip_diff * pip_weight
    if not _is_race_mode(board):
        score -= pip_diff * 0.10 * intensity

    prime_score = _calculate_prime_score(board, ai_player)
    opp_prime = _calculate_prime_score(board, opp)
    score += (prime_score - opp_prime) * prime_weight

    anchor_score = _calculate_anchor_score(board, ai_player)
    opp_anchor = _calculate_anchor_score(board, opp)
    score += (anchor_score - opp_anchor) * anchor_weight

    my_risk = _calculate_blot_risk(board, ai_player)
    opp_risk = _calculate_blot_risk(board, opp)
    score -= my_risk * blot_weight
    score += opp_risk * blot_weight

    trapped = _count_trapped_checkers(board, ai_player)
    if trapped > 0:
        score += trapped * 0.4

    hit_bonus = _calculate_conditional_hit_bonus(board, ai_player) * hit_mult
    score += hit_bonus

    ai_strength = _evaluate_home_board(board, ai_player)
    opp_strength = _evaluate_home_board(board, opp)
    score += (ai_strength - opp_strength) * WEIGHTS['boardStrength']

    point5 = board[5] if 5 < len(board) else 0
    owns_p5 = (ai_player == 'white' and point5 >= 2) or (ai_player == 'black' and point5 <= -2)
    if owns_p5:
        score += 1.1

    for i in range(1, 25):
        v = board[i] if i < len(board) else 0
        ours = (ai_player == 'white' and v > 0) or (ai_player == 'black' and v < 0)
        if ours and abs(v) > 3:
            score -= 0.3 * (abs(v) - 3)

    if strategy_intensity > 0:
        strong_inner = 5 if ai_player == 'white' else 20
        strong_outer = 7 if ai_player == 'white' else 18
        home_start = 1 if ai_player == 'white' else 19
        home_end = 6 if ai_player == 'white' else 24
        sci = board[strong_inner] if strong_inner < len(board) else 0
        owns_si = (sign > 0 and sci >= 2) or (sign < 0 and sci <= -2)
        if owns_si:
            score += 1.6 * intensity
        sco = board[strong_outer] if strong_outer < len(board) else 0
        owns_so = (sign > 0 and sco >= 2) or (sign < 0 and sco <= -2)
        if owns_so:
            score += 1.2 * intensity
        anchors = 0
        for i in range(home_start, home_end + 1):
            v = board[i] if i < len(board) else 0
            if (sign > 0 and v >= 2) or (sign < 0 and v <= -2):
                anchors += 1
        if anchors >= 2:
            score += 0.9 * intensity
        back_point = 24 if ai_player == 'white' else 1
        back_stack = abs(board[back_point] if back_point < len(board) else 0)
        if back_stack >= 4:
            score -= 0.6 * intensity
        splitter = 23 if ai_player == 'white' else 2
        split_count = board[splitter] if splitter < len(board) else 0
        has_split = (sign > 0 and split_count >= 2) or (sign < 0 and split_count <= -2)
        if has_split:
            score += 0.5 * intensity

    if not _is_race_mode(board):
        made = 0
        exposed = 0
        for i in range(1, 25):
            v = board[i] if i < len(board) else 0
            if (sign > 0 and v >= 2) or (sign < 0 and v <= -2):
                made += 1
            elif (sign > 0 and v == 1) or (sign < 0 and v == -1):
                exposed += 1
        score += made * 0.3 * intensity
        score -= exposed * 0.12 * intensity

    if ai_all_home or ai_born > opp_born:
        score += (ai_born - opp_born) * WEIGHTS['contactBearOff']
    score += (ai_born - opp_born) * 0.5
    return max(-50, min(50, score))


# ---------------------------------------------------------------------------
# move-picker.ts (pickBestFullTurn)
# ---------------------------------------------------------------------------
def pick_best_full_turn(board, dice, mover, evaluator, max_sequences=192, epsilon=0.0, rng=None):
    if rng is None:
        rng = __import__('random').random
    sequences = generate_all_turn_sequences(board, dice, mover, [], max_sequences)
    if len(sequences) == 0:
        return {'sequence': [], 'score': float('-inf')}
    opponent = 'black' if mover == 'white' else 'white'
    afters = []
    for seq in sequences:
        b = board
        for m in seq:
            b = apply_move(b, m, mover)
        afters.append(b)
    raw = evaluator(afters, mover, opponent)
    scores = []
    for s in raw:
        scores.append(s if isinstance(s, (int, float)) and s == s else float('-inf'))
    best_idx = 0
    best_score = scores[0]
    for i in range(1, len(scores)):
        if scores[i] > best_score:
            best_score = scores[i]
            best_idx = i
    if epsilon > 0 and len(sequences) > 1:
        if rng() < epsilon:
            j = int(rng() * len(sequences))
            return {'sequence': sequences[j], 'score': scores[j]}
    return {'sequence': sequences[best_idx], 'score': best_score}
