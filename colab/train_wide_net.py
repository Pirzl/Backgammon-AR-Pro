"""
Colab training script for VIVO Backgammon wide-net (198->256->128->64->1).

Run this in a Google Colab notebook cell (Runtime -> Change runtime type -> GPU).
It installs Node, clones the repo on the working branch, installs deps (tfjs-node-gpu
links against Colab's CUDA), and runs the existing self-play CLI (on-policy, MC outcome)
until the pure-NN winrate vs the heuristic reaches >=60% in two consecutive evals.

Prereqs (human step): fork/own the repo and push branch 260815-wide-net-gpu to GitHub
so Colab can clone it. Replace REPO_URL below.

After it finishes, download public/model_weights.json back to the local project.
"""

REPO_URL = "https://github.com/TU_USUARIO/BACKGAMMON-VIVO.git"  # <-- replace
BRANCH = "260815-wide-net-gpu"

# ---- Cell 1: check GPU ----
# !nvidia-smi

# ---- Cell 2: install Node 22 ----
# !curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
# !apt-get install -y nodejs
# !node --version && npm --version

# ---- Cell 3: clone working branch ----
# !rm -rf BACKGAMMON-VIVO*
# !git clone --branch {BRANCH} {REPO_URL}
# %cd BACKGAMMON-VIVO - copia

# ---- Cell 4: install deps (tfjs-node-gpu should link to Colab CUDA) ----
# !npm ci

# ---- Cell 5: train (on-policy MC, vs heuristic; stop when rate>=0.60 x2) ----
# This runs forever until you interrupt; watch the {event:'eval', rate} lines.
# !npx tsx src/features/ai-worker/training/cli.ts \
#     --games=100000 --opponent=heuristic --label=outcome \
#     --exploration=0.15 --max-moves=400 --epochs=3 \
#     --eval-every=250 --eval-games=200 --nn-blend=1 --save-every=50

# ---- Cell 6: download the trained weights ----
# from google.colab import files
# files.download('public/model_weights.json')

"""
Expected CLI output (each eval-every games):
  {"event":"eval","game":250,"redWins":...,"decisive":200,"games":200,"rate":0.55,"rateAll":0.55}
Watch `rate`. When two consecutive evals show rate >= 0.60, interrupt (Runtime -> Interrupt)
and run Cell 6 to download the weights.

If rate plateaus < 0.60 after ~5000 games: stop, edit BRANCH's net-arch.ts hidden to
[512, 256, 128] (re-run Task 3/4 locally to resync, push, and re-run this notebook),
or raise --games further. Do NOT declare success below 0.60.
"""
