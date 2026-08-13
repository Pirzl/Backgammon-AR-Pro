import * as tf from '@tensorflow/tfjs';
import type { PlayerColor } from '../../entities/game/types';
import { getBarIndex, getOffIndex } from '../../entities/game/rules';

/**
 * Minimum trained_count we expect from /model_weights.json. Bump this after a
 * published retrain so the browser can warn when a *stale* (older) checkpoint is
 * still loaded. NOTE: trained_count is a GROWING counter, not a fixed version, so
 * the warning must fire only when loadedCount < WEIGHTS_VERSION, never when newer.
 */
export const WEIGHTS_VERSION = 244663;

/**
 * Manages the TensorFlow.js Neural Network model for Backgammon position evaluation.
 *
 * The browser builds the SAME 198->40->1 architecture in code as the training
 * pipeline (src/features/ai-worker/nn-model.ts). Previously this loaded the
 * 512-unit /ai/tfjs_model base whose weight shapes never matched the trained
 * checkpoint, so setWeights() always threw and the browser NEVER used trained
 * weights. Building in code guarantees the shapes line up with model_weights.json.
 */
export class NNModel {
  private model: tf.LayersModel | null = null;
  private isLoading: boolean = false;

  async load(): Promise<void> {
    if (this.model || this.isLoading) return;
    this.isLoading = true;
    try {
      console.log('AI: Building 198->40->1 model for position evaluation');
      this.model = this.buildModel();
      console.log('AI: Neural Network model built successfully');
      await this.applyLocalWeights();
    } catch (error) {
      console.error('AI: Failed to build Neural Network model:', error);
      this.model = null;
    } finally {
      this.isLoading = false;
    }
  }

  /** Mirrors ai-worker/nn-model.ts ensureModel architecture (198->40->1, tanh). */
  private buildModel(): tf.LayersModel {
    const input = tf.input({ shape: [198] });
    const hidden = tf.layers
      .dense({ units: 40, activation: 'tanh', kernelInitializer: 'zeros', biasInitializer: 'zeros' })
      .apply(input) as tf.SymbolicTensor;
    const output = tf.layers
      .dense({ units: 1, activation: 'tanh', kernelInitializer: 'zeros', biasInitializer: 'zeros' })
      .apply(hidden) as tf.SymbolicTensor;
    const model = tf.model({ inputs: input, outputs: output });
    model.compile({ optimizer: tf.train.adam(0.01), loss: 'meanSquaredError' });
    return model;
  }

  private async applyLocalWeights(): Promise<void> {
    if (!this.model) return;
    const payload = await this.fetchRuntimeWeights();
    if (!payload || !payload.weights || payload.weights.length === 0) return;
    try {
      const loadedCount = payload.trained_count ?? -1;
      // Only warn when the checkpoint is OLDER than what we expect.
      if (loadedCount >= 0 && loadedCount < WEIGHTS_VERSION) {
        console.warn(
          `AI: Stale model weights detected (trained_count=${loadedCount}, expected >= ${WEIGHTS_VERSION}). ` +
            `The page may be showing an older checkpoint.`
        );
      }
      const tensors = payload.weights.map(w => tf.tensor(w.data, w.shape));
      this.model.setWeights(tensors);
      tensors.forEach(t => t.dispose());
      console.log(
        `AI: Applied model weights (trained_count=${loadedCount}, updated_at=${payload.updated_at ?? '?'})`
      );
    } catch (error) {
      console.warn('AI: Local weights apply failed:', error);
    }
  }

  /**
   * Loads the current checkpoint. Prefers the live Supabase `model_weights` row
   * (id='current') so retrains published by the CI pipeline take effect WITHOUT a
   * redeploy; falls back to the static /model_weights.json asset.
   */
  private async fetchRuntimeWeights(): Promise<{
    weights?: { shape: number[]; data: number[] }[];
    trained_count?: number;
    updated_at?: string;
  } | null> {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (url && key) {
        const client = createClient(url, key);
        const { data, error } = await client
          .from('model_weights')
          .select('weights, trained_count, updated_at')
          .eq('id', 'current')
          .maybeSingle();
        if (!error && data?.weights?.length) {
          console.log('AI: Loaded model weights from Supabase model_weights (runtime)');
          return data;
        }
        if (error) console.warn('AI: Supabase weights fetch error:', error);
      }
    } catch (e) {
      console.warn('AI: Supabase weights fetch failed, using static asset:', e);
    }
    // Static fallback.
    try {
      const resp = await fetch('/model_weights.json');
      if (!resp.ok) return null;
      return (await resp.json()) as {
        weights?: { shape: number[]; data: number[] }[];
        trained_count?: number;
        updated_at?: string;
      };
    } catch (e) {
      console.warn('AI: Static weights fetch failed:', e);
      return null;
    }
  }

  async evaluate(board: number[], turn: PlayerColor): Promise<number> {
    if (!this.model) {
      await this.load();
      if (!this.model) return 0;
    }

    const inputData = this.encodeBoard(board, turn);

    return tf.tidy(() => {
      const inputTensor = tf.tensor2d([inputData], [1, 198]);
      const prediction = this.model!.predict(inputTensor) as tf.Tensor;
      return prediction.dataSync()[0] ?? 0;
    });
  }

  /**
   * Encodes the board into a 198-vector (TD-Gammon style).
   * 198 = 24 points * 4 units * 2 players + 2 home/bar units * 2 players + 2 turn units.
   */
  private encodeBoard(board: number[], turn: PlayerColor): number[] {
    const featureVector: number[] = new Array(198).fill(0);
    const sign = turn === 'white' ? 1 : -1;
    const oppSign = -sign;

    // 1. Points (1-24) - 4 units per player per point (24 * 4 * 2 = 192)
    for (let point = 1; point <= 24; point++) {
      const checkers = board[point] ?? 0;
      const baseOffset = (point - 1) * 8; // 8 units per point total (4 for player1, 4 for player2)

      // Player to move
      const myCheckers = sign === 1 ? Math.max(0, checkers) : Math.max(0, -checkers);
      if (myCheckers >= 1) featureVector[baseOffset + 0] = 1;
      if (myCheckers >= 2) featureVector[baseOffset + 1] = 1;
      if (myCheckers >= 3) featureVector[baseOffset + 2] = 1;
      if (myCheckers > 3) featureVector[baseOffset + 3] = (myCheckers - 3) / 2.0;

      // Opponent
      const oppCheckers = oppSign === 1 ? Math.max(0, checkers) : Math.max(0, -checkers);
      if (oppCheckers >= 1) featureVector[baseOffset + 4] = 1;
      if (oppCheckers >= 2) featureVector[baseOffset + 5] = 1;
      if (oppCheckers >= 3) featureVector[baseOffset + 6] = 1;
      if (oppCheckers > 3) featureVector[baseOffset + 7] = (oppCheckers - 3) / 2.0;
    }

    // Indices for bar and off
    const myBarIdx = getBarIndex(turn);
    const oppBarIdx = getBarIndex(turn === 'white' ? 'black' : 'white');
    const myOffIdx = getOffIndex(turn);
    const oppOffIdx = getOffIndex(turn === 'white' ? 'black' : 'white');

    // 2. Bar (index 192, 193)
    featureVector[192] = Math.abs(board[myBarIdx] ?? 0) / 2.0;
    featureVector[193] = Math.abs(board[oppBarIdx] ?? 0) / 2.0;

    // 3. Off (index 194, 195)
    featureVector[194] = Math.abs(board[myOffIdx] ?? 0) / 15.0;
    featureVector[195] = Math.abs(board[oppOffIdx] ?? 0) / 15.0;

    // 4. Turn (index 196, 197)
    featureVector[196] = turn === 'white' ? 1 : 0;
    featureVector[197] = turn === 'black' ? 1 : 0;

    return featureVector;
  }
}

// Export singleton instance
export const nnModel = new NNModel();
