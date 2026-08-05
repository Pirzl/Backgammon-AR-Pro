import * as tf from '@tensorflow/tfjs';
import type { PlayerColor } from '../../entities/game/types';
import { getBarIndex, getOffIndex } from '../../entities/game/rules';

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

  async ensureModel(): Promise<tf.LayersModel> {
    if (this.model) return this.model;
    const input = tf.input({ shape: [198] });
    const hidden = tf.layers.dense({ units: 40, activation: 'tanh' }).apply(input);
    const output = tf.layers.dense({ units: 1, activation: 'tanh' }).apply(hidden);
    this.model = tf.model({ inputs: input, outputs: output as tf.SymbolicTensor });
    this.model.compile({
      optimizer: tf.train.sgd(0.005),
      loss: 'meanSquaredError',
    });
    this.loaded = true;
    return this.model;
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

  async trainOnGame(examples: TrainingExample[]): Promise<void> {
    if (examples.length === 0) return;
    if (!this.loaded) await this.ensureModel();
    if (!this.model) return;

    const xs: number[][] = [];
    const ys: number[][] = [];

    for (const ex of examples) {
      xs.push(this.encodeBoard(ex.board, ex.turn));
      ys.push([Math.max(-1, Math.min(1, ex.target))]);
    }

    const xsTensor = tf.tensor2d(xs);
    const ysTensor = tf.tensor2d(ys);

    const result = await this.model.fit(xsTensor, ysTensor, {
      epochs: 1,
      batchSize: Math.min(64, examples.length),
      shuffle: true,
      verbose: 0,
    });

    xsTensor.dispose();
    ysTensor.dispose();

    const loss = typeof result.history.loss?.[0] === 'number' ? result.history.loss[0] : 0;
    this.trainedCount += examples.length;
    this.totalWeightUpdates += examples.length;

    console.log(`[NN] Trained on ${examples.length} positions, loss=${loss.toFixed(4)}, total=${this.trainedCount}`);
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
