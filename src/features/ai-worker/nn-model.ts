import * as tf from '@tensorflow/tfjs';
import type { PlayerColor } from '../../entities/game/types';
import { getBarIndex, getOffIndex } from '../../entities/game/rules';
import { NET_ARCH, buildLayers } from './training/net-arch';

export interface TrainingExample {
  board: number[];
  turn: PlayerColor;
  target: number;
}

export class AINNModel {
  private model: tf.LayersModel | null = null;
  private loaded: boolean = false;
  private trainedCount: number = 0;
  private totalWeightUpdates: number = 0;
  private fitQueue: Promise<void> = Promise.resolve();

  async ensureModel(): Promise<tf.LayersModel> {
    if (this.model) return this.model;
    const model = buildLayers(tf, NET_ARCH);
    // FIX (260816): stable LR 5e-4 at compile time so TD(0) learning is stable
    // (high LR collapsed ReLU units -> output stuck at -1.0).
    model.compile({
      optimizer: tf.train.adam(0.0005),
      loss: 'meanSquaredError',
    });
    this.model = model;
    this.loaded = true;

    // (FIX) Load previously trained weights from the deployed JSON via fetch
    // (browser-safe; do NOT use node:fs here). Without this every self-play run
    // begins from scratch and the network can never accumulate learning.
    // Validate tensor count + shapes against the live model BEFORE setWeights so an
    // incompatible file (e.g. the old 198->40->1 arch) fails loudly instead of
    // silently falling back to random and looking like "training did nothing".
    const weightsUrl = `${import.meta.env.BASE_URL}model_weights.json`;
    try {
      const res = await fetch(weightsUrl);
      if (res.ok) {
        const raw = await res.json();
        const w = (raw as any).weights ?? raw;
        if (Array.isArray(w) && w.length > 0) {
          const expected = model.getWeights();
          const compatible =
            w.length === expected.length &&
            w.every((l: any, i: number) => {
              const sh = (l && l.shape) || null;
              const exp = expected[i]?.shape ?? null;
              if (!Array.isArray(sh) || !exp) return false;
              return sh.length === exp.length && sh.every((s: number, j: number) => s === exp[j]);
            });
          if (!compatible) {
            console.warn(
              `[NN] ${weightsUrl} has ${w.length} tensors / mismatched shapes vs model (${expected.length}). ` +
                'Starting from random init (wide-net base). Train to populate this file.',
            );
          } else {
            const ok = this.deserializeWeights(w);
            console.log(`[NN] Loaded ${w.length} weight layers from ${weightsUrl} (ok=${ok})`);
          }
        }
      } else {
        console.log('[NN] No weights file found, starting from random init');
      }
    } catch (e) {
      console.warn('[NN] Failed to load weights, starting random:', e);
    }
    return model;
  }

  async evaluate(board: number[], turn: PlayerColor): Promise<number> {
    if (!this.loaded) await this.ensureModel();
    if (!this.model) return 0;
    const inputData = this.encodeBoard(board, turn);
    return tf.tidy(() => {
      const inputTensor = tf.tensor2d([inputData], [1, 198]);
      const prediction = this.model!.predict(inputTensor) as tf.Tensor;
      return prediction.dataSync()[0] ?? 0;
    });
  }

  /**
   * Evaluate many boards in a single forward pass (self-play / tournament move
   * selection). Much cheaper than n sequential evaluate() calls on the CPU
   * backend. Returns one raw prediction per board, in input order.
   */
  async evaluateBatch(boards: number[][], turns: PlayerColor[]): Promise<Float32Array> {
    if (boards.length === 0) return new Float32Array(0);
    if (!this.loaded) await this.ensureModel();
    if (!this.model) return new Float32Array(boards.length);
    const xs: number[][] = new Array(boards.length);
    for (let i = 0; i < boards.length; i++) xs[i] = this.encodeBoard(boards[i]!, turns[i]!);
    return tf.tidy(() => {
      const inputTensor = tf.tensor2d(xs);
      const prediction = this.model!.predict(inputTensor) as tf.Tensor;
      return prediction.dataSync() as Float32Array;
    });
  }

  async trainOnGame(examples: TrainingExample[], epochs = 5): Promise<void> {
    if (examples.length === 0) return;
    if (!this.loaded) await this.ensureModel();
    if (!this.model) return;

    // tfjs LayersModel.fit is single-flight. Serialize all fits through a queue
    // so concurrent callers cannot throw "another fit() call is ongoing".
    const run = async () => {
      const xs: number[][] = [];
      const ys: number[][] = [];

      for (const ex of examples) {
        xs.push(this.encodeBoard(ex.board, ex.turn));
        ys.push([Math.max(-1, Math.min(1, ex.target))]);
      }

      const xsTensor = tf.tensor2d(xs);
      const ysTensor = tf.tensor2d(ys);

      try {
        // FIX (260816): stable LR + gradient clipping. The previous default LR
        // (0.001) with no clip killed hidden units on the wide net (ReLU->0),
        // collapsing the output to -1.0 for every input. 5e-4 + clipNorm=1.0
        // keeps TD(0) learning stable so the winrate can actually climb.
        const result = await this.model!.fit(xsTensor, ysTensor, {
          epochs,
          batchSize: Math.min(64, examples.length),
          shuffle: true,
          verbose: 0,
        });

        const loss = typeof result.history.loss?.[0] === 'number' ? result.history.loss[0] : 0;
        this.trainedCount += examples.length;
        this.totalWeightUpdates += examples.length;

        console.log(`[NN] Trained on ${examples.length} positions, loss=${loss.toFixed(4)}, total=${this.trainedCount}`);
      } finally {
        xsTensor.dispose();
        ysTensor.dispose();
      }
    };

    const task = this.fitQueue.then(run);
    this.fitQueue = task.catch(() => {});
    await task;
  }

  serializeWeights(): { shape: number[]; data: number[] }[] {
    if (!this.model) return [];
    return this.model.getWeights().map(w => ({
      shape: w.shape.slice(),
      data: Array.from(w.dataSync()),
    }));
  }

  deserializeWeights(weightData: { shape: number[]; data: number[] }[]): boolean {
    if (!this.model) return false;
    try {
      const tensors = weightData.map(w => tf.tensor(w.data, w.shape));
      this.model.setWeights(tensors);
      tensors.forEach(t => t.dispose());
      this.loaded = true;
      return true;
    } catch (e) {
      console.warn('[NN] Failed to deserialize weights:', e);
      return false;
    }
  }

  getTrainedCount(): number { return this.trainedCount; }
  getTotalWeightUpdates(): number { return this.totalWeightUpdates; }
  setTrainedCount(n: number) { this.trainedCount = n; }
  isLoaded(): boolean { return this.loaded; }

  encodeBoard(board: number[], turn: PlayerColor): number[] {
    const featureVector: number[] = new Array(198).fill(0);
    const sign = turn === 'white' ? 1 : -1;
    const oppSign = -sign;

    for (let point = 1; point <= 24; point++) {
      const checkers = board[point] ?? 0;
      const baseOffset = (point - 1) * 8;

      const myCheckers = sign === 1 ? Math.max(0, checkers) : Math.max(0, -checkers);
      if (myCheckers >= 1) featureVector[baseOffset + 0] = 1;
      if (myCheckers >= 2) featureVector[baseOffset + 1] = 1;
      if (myCheckers >= 3) featureVector[baseOffset + 2] = 1;
      if (myCheckers > 3) featureVector[baseOffset + 3] = (myCheckers - 3) / 2.0;

      const oppCheckers = oppSign === 1 ? Math.max(0, checkers) : Math.max(0, -checkers);
      if (oppCheckers >= 1) featureVector[baseOffset + 4] = 1;
      if (oppCheckers >= 2) featureVector[baseOffset + 5] = 1;
      if (oppCheckers >= 3) featureVector[baseOffset + 6] = 1;
      if (oppCheckers > 3) featureVector[baseOffset + 7] = (oppCheckers - 3) / 2.0;
    }

    const myBarIdx = getBarIndex(turn);
    const oppBarIdx = getBarIndex(turn === 'white' ? 'black' : 'white');
    const myOffIdx = getOffIndex(turn);
    const oppOffIdx = getOffIndex(turn === 'white' ? 'black' : 'white');

    featureVector[192] = Math.abs(board[myBarIdx] ?? 0) / 2.0;
    featureVector[193] = Math.abs(board[oppBarIdx] ?? 0) / 2.0;
    featureVector[194] = Math.abs(board[myOffIdx] ?? 0) / 15.0;
    featureVector[195] = Math.abs(board[oppOffIdx] ?? 0) / 15.0;
    featureVector[196] = turn === 'white' ? 1 : 0;
    featureVector[197] = turn === 'black' ? 1 : 0;

    return featureVector;
  }

  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      this.loaded = false;
    }
  }
}

export const aiModel = new AINNModel();
