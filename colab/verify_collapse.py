import json, math, random
import bg_engine as bg

raw = json.load(open('public/test_model.json'))
w = raw['weights']
W1, b1, W2, b2, W3, b3, W4, b4 = [l['data'] for l in w]

def mat(M, input_dim, x, b):
    # M is a flat weight list of shape [input_dim, len(b)] (row-major)
    return [b[j] + sum(x[i] * M[i * len(b) + j] for i in range(input_dim)) for j in range(len(b))]

def fwd(fv):
    h1 = [max(0, v) for v in mat(W1, 198, fv, b1)]
    h2 = [max(0, v) for v in mat(W2, 256, h1, b2)]
    h3 = [max(0, v) for v in mat(W3, 128, h2, b3)]
    y = [math.tanh(v) for v in mat(W4, 64, h3, b4)]
    return y[0], (h1, h2, h3)

rng = random.Random(1)
preds = []
hs = ([], [], [])
for t in ['white', 'black']:
    y, h = fwd(bg.encode_board(bg.INITIAL_BOARD, t))
    preds.append(y)
    for _ in range(8):
        b = [0] * 30
        for _ in range(15):
            b[rng.randint(1, 24)] += 1
        for _ in range(15):
            b[rng.randint(1, 24)] -= 1
        y, h = fwd(bg.encode_board(b, t))
        preds.append(y)
        for li, hh in enumerate(h):
            hs[li].append(hh)

mean = sum(preds) / len(preds)
std = math.sqrt(sum((p - mean) ** 2 for p in preds) / len(preds))
print('preds =', [round(p, 3) for p in preds], 'std = %.4f' % std)

dead = []
for st in hs:
    n_dead = sum(1 for u in range(len(st[0])) if all(abs(st[k][u]) < 1e-9 for k in range(len(st))))
    dead.append(n_dead / len(st[0]))
print('dead =', ['%.0f%%' % (x * 100) for x in dead])

if std < 1e-3:
    print('VEREDICTO: COLLAPSED')
elif any(x > 0.5 for x in dead):
    print('VEREDICTO: WARNING (unidades muertas)')
else:
    print('VEREDICTO: ALIVE')
