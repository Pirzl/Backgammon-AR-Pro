import * as tf from '@tensorflow/tfjs';
import type { PlayerColor } from '../../entities/game/types';
import { getBarIndex, getOffIndex } from '../../entities/game/rules';

/**
 * Manages the TensorFlow.js Neural Network model for Backgammon position evaluation.
 */
export class NNModel {
  private model: tf.LayersModel | null = null;
  private isLoading: boolean = false;

  /**
   * Loads the model from the specified path.
   * Path should point to the model.json file.
   */
  async load(path: string = '/ai/tfjs_model/tfjs_model/model.json'): Promise<void> {
    if (this.model || this.isLoading) return;

    this.isLoading = true;
    try {
      console.log('AI: Loading Neural Network from', path);
      this.model = await tf.loadLayersModel(path);
      console.log('AI: Neural Network loaded successfully');
      
      // Warm up the model with a dummy prediction
      const dummyInput = tf.zeros([1, 198]);
      const result = this.model.predict(dummyInput) as tf.Tensor;
      result.dispose();
      dummyInput.dispose();
    } catch (error) {
      console.error('AI: Failed to load Neural Network model:', error);
      this.model = null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Evaluates a board position using the neural network.
   * Returns a value between -1 and 1 from the perspective of the player to move.
   */
  async evaluate(board: number[], turn: PlayerColor): Promise<number> {
    if (!this.model) {
      await this.load();
      if (!this.model) return 0; // Fallback if still no model
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
