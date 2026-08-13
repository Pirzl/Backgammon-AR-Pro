import * as tf from '@tensorflow/tfjs';
import type { PlayerColor } from '../../entities/game/types';
import { getBarIndex, getOffIndex } from '../../entities/game/rules';

/**
 * Cache-busting version for the static /model_weights.json asset. Bump this after a
 * retrain so the browser does not serve a stale cached copy (fetch ?v=...). The
 * stale-WARNING is now based on the weights file being OLDER than this version
 * (trained_count < WEIGHTS_VERSION), since trained_count is a growing counter and no
 * longer equals this constant.
 */
export const WEIGHTS_VERSION = 244663;

/**
 * Manages the TensorFlow.js Neural Network model for Backgammon position evaluation.
 *
 * Builds the 198→40→1 architecture in code — the SAME architecture used by the
 * training pipeline (ai-worker/nn-model.ts) — and applies the trained weights from
 * /model_weights.json (Supabase first, static asset fallback).
 *
 * Previously this loaded a large 512-unit base model (/ai/tfjs_model/tfjs_model/model.json)
 * whose weight shapes never matched the trained checkpoint, so setWeights() always threw
 * and the browser never used trained weights (E2). Building the architecture in code
 * guarantees the shapes line up and the self-play results take effect in the browser.
 */
export class NNModel {
  private model: tf.LayersModel | null = null;
  private isLoading: boolean = false;

  async load(_path?: string): Promise<void> {
    if (this.model || this.isLoading) return;
    this.isLoading = true;
    try {
      this.model = this.buildModel();
      console.log('AI: Built 198→40→1 model for position evaluation');
      await this.applyLocalWeights();
    } catch (error) {
      console.error('AI: Failed to build Neural Network model:', error);
      this.model = null;
    } finally {
      this.isLoading = false;
    }
  }

  /** 198→40→1 tanh net, matching ai-worker/nn-model.ts ensureModel(). */
  private buildModel(): tf.LayersModel {
    const input = tf.input({ shape: [198] });
    const hidden = tf.layers.dense({ units: 40, activation: 'tanh' }).apply(input);
    const output = tf.layers.dense({ units: 1, activation: 'tanh' }).apply(hidden);
    return tf.model({ inputs: input, outputs: output as tf.SymbolicTensor });
  }

  private async applyLocalWeights(): Promise<void> {
    if (!this.model) return;
    const payload = await this.fetchRuntimeWeights();
    if (!payload || !payload.weights || payload.weights.length === 0) return;
    try {
      const loadedCount = payload.trained_count ?? -1;
      if (loadedCount >= 0 && loadedCount < WEIGHTS_VERSION) {
        console.warn(
          `AI: Stale model weights detected (trained_count=${loadedCount}, older than ${WEIGHTS_VERSION}). ` +
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
    // Static fallback (cache-busted with WEIGHTS_VERSION).
    try {
      const resp = await fetch(`/model_weights.json?v=${WEIGHTS_VERSION}`);
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
