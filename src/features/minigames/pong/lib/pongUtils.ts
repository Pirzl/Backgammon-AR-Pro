export const GAME_WIDTH = 1100;
export const GAME_HEIGHT = 600;
export const PADDLE_WIDTH = 40;
export const PADDLE_HEIGHT = 100;
export const BALL_SIZE = 15;
export const MAX_SCORE = 11;

export const INITIAL_BALL_SPEED = 7;
export const PADDLE_SPEED = 8;
export const CPU_PADDLE_SPEED_MAX = 6; // To make it beatable
export const PADDLE_MARGIN = 10;
export const POWER_UP_DURATION_MS = 5000;

// Helper to calculate paddle collision and return new ball velocity
export function calculateBounce(
  ballY: number,
  paddleY: number,
  paddleHeight: number,
  speed: number
): { vx: number, vy: number } {
  // Relative intersect: exactly where did the ball hit the paddle (center = 0, edges = -1 or 1)
  const relativeIntersectY = (paddleY + (paddleHeight / 2)) - ballY;
  const normalizedRelativeIntersectionY = (relativeIntersectY / (paddleHeight / 2));
  const bounceAngle = normalizedRelativeIntersectionY * (Math.PI / 4); // Max bounce angle: 45deg
  
  return {
    vx: speed * Math.cos(bounceAngle),
    vy: speed * -Math.sin(bounceAngle)
  };
}
