/**
 * Shared NN architecture definition for the Backgammon evaluator.
 *
 * Centralizes the layer config so the BROWSER model (game-board/nn-model.ts)
 * and the TRAINING model (ai-worker/nn-model.ts) can never drift apart.
 *
 * Output stays a SINGLE scalar in [-1,1] (position equity from the side-to-move
 * perspective) on purpose: it reuses 100% of the existing pipeline (encodeBoard,
 * ±1 outcome labels, evaluate(), runTournament()) without touching tournament or
 * move-picker. Only the hidden width grows. tfjs is passed in as `tf` so this
 * module has no backend import of its own (safe to load in browser or Node).
 */

export interface NetArch {
  input: number;
  hidden: number[];
  hiddenAct: string;
  output: number;
  outputAct: string;
}

// Wide net: 198 -> 256 -> 128 -> 64 -> 1 (ReLU hidden, tanh scalar output).
// Replaces the old 198 -> 40 -> 1 that plateaued ~30-45% vs the heuristic.
export const NET_ARCH: NetArch = {
  input: 198,
  hidden: [256, 128, 64],
  hiddenAct: 'relu',
  output: 1,
  outputAct: 'tanh',
};

/**
 * Builds a tfjs LayersModel from the given architecture.
 * @param tf  the tfjs namespace (browser @tensorflow/tfjs or Node tfjs).
 * @param arch architecture to build (defaults to NET_ARCH).
 * @returns a compiled-ready (uncompiled) LayersModel.
 */
export function buildLayers(tf: any, arch: NetArch = NET_ARCH): any {
  const input = tf.input({ shape: [arch.input] });
  let x: any = input;
  for (const units of arch.hidden) {
    x = tf.layers.dense({ units, activation: arch.hiddenAct }).apply(x);
  }
  const output = tf.layers.dense({ units: arch.output, activation: arch.outputAct }).apply(x);
  return tf.model({ inputs: input, outputs: output });
}
