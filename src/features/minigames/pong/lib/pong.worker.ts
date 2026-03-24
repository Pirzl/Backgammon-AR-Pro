import { 
  GAME_WIDTH,
  GAME_HEIGHT, 
  PADDLE_HEIGHT, 
  BALL_SIZE,
  INITIAL_BALL_SPEED,
  calculateBounce
} from './pongUtils';

interface PongBall {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  originalSpeed: number;
  isBullet: boolean;
  history: { x: number, y: number }[];
  lastHitBy: 'player' | 'cpu' | null;
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

interface PowerUp {
  x: number;
  y: number;
  type: 'SIZE' | 'SHRINK' | 'FREEZE' | 'MAGNET' | 'MULTI' | 'BALA';
  active: boolean;
}

const state = {
  playerY: (GAME_HEIGHT - PADDLE_HEIGHT) / 2,
  cpuY: (GAME_HEIGHT - PADDLE_HEIGHT) / 2,
  balls: [] as PongBall[],
  obstacles: [] as Obstacle[],
  powerUps: [] as PowerUp[],
  playerPaddleHeight: PADDLE_HEIGHT,
  cpuPaddleHeight: PADDLE_HEIGHT,
  cpuSpeed: 6,
  playerFreezeTimer: 0,
  cpuFreezeTimer: 0,
  playerMagnetTimer: 0,
  cpuMagnetTimer: 0,
  playerBulletTimer: 0,
  cpuBulletTimer: 0,
  multiballTimer: 0,
  level: 1,
  playerSide: 'left' as 'left' | 'right'
};

const spawnBall = (x: number, y: number, dx: number, dy: number, speed: number): PongBall => ({
  x, y, dx, dy, speed, originalSpeed: speed, isBullet: false, history: [], lastHitBy: null
});

function spawnObstacles() {
  const count = state.level === 3 ? 2 : (state.level === 4 ? 3 : 4);
  const newObstacles: Obstacle[] = [];
  const middleX = GAME_WIDTH / 2;
  for (let i = 0; i < count; i++) {
    newObstacles.push({
      x: middleX - 10,
      y: (GAME_HEIGHT / (count + 1)) * (i + 1) - 30,
      width: 20,
      height: 60,
      active: true
    });
  }
  state.obstacles = newObstacles;
}

function resetBall(ball: PongBall, serveToPlayer: boolean = true) {
  ball.x = GAME_WIDTH / 2;
  ball.y = GAME_HEIGHT / 2;
  ball.dx = serveToPlayer ? (state.playerSide === 'left' ? -1 : 1) : (state.playerSide === 'left' ? 1 : -1);
  ball.dy = (Math.random() - 0.5) * 2;
  ball.speed = INITIAL_BALL_SPEED;
  ball.history = [];
}

function spawnPowerUp() {
  const types: PowerUp['type'][] = state.level >= 4 
    ? ['SIZE', 'SHRINK', 'FREEZE', 'MAGNET', 'MULTI', 'BALA'] 
    : ['SIZE', 'SHRINK', 'FREEZE'];
  const type = types[Math.floor(Math.random() * types.length)];
  if (!type) return;

  state.powerUps.push({
    x: GAME_WIDTH / 4 + Math.random() * (GAME_WIDTH / 2),
    y: 50 + Math.random() * (GAME_HEIGHT - 100),
    type,
    active: true
  });
}

function updatePhysics() {
  // 1. Process Timers
  if (state.playerFreezeTimer > 0) state.playerFreezeTimer -= 16.67;
  if (state.cpuFreezeTimer > 0) state.cpuFreezeTimer -= 16.67;
  if (state.playerMagnetTimer > 0) state.playerMagnetTimer -= 16.67;
  if (state.cpuMagnetTimer > 0) state.cpuMagnetTimer -= 16.67;
  if (state.multiballTimer > 0) state.multiballTimer -= 16.67;

  // 2. CPU AI
  if (state.cpuFreezeTimer <= 0) {
    const incomingBall = state.balls.find(b => (state.playerSide === 'left' ? b.dx > 0 : b.dx < 0)) || state.balls[0];
    if (incomingBall) {
      const paddleCenter = state.cpuY + state.cpuPaddleHeight / 2;
      if (paddleCenter < incomingBall.y - 15) state.cpuY = Math.min(GAME_HEIGHT - state.cpuPaddleHeight, state.cpuY + state.cpuSpeed);
      else if (paddleCenter > incomingBall.y + 15) state.cpuY = Math.max(0, state.cpuY - state.cpuSpeed);
    }
  }

  // 3. Power-ups spawn
  if (state.level >= 3 && Math.random() < 0.005 && state.powerUps.filter(p => p.active).length < 2) {
    spawnPowerUp();
  }

  // 4. Ball Physics
  const events: { type: string, small?: boolean, side?: string, bullet?: boolean, powerUp?: string, playerScored?: boolean }[] = [];

  state.balls.forEach((ball, idx) => {
    // Magnet
    if (state.level >= 4) {
      if (((state.playerSide === 'left' && ball.dx < 0) || (state.playerSide === 'right' && ball.dx > 0)) && state.playerMagnetTimer > 0) {
        ball.dy += (state.playerY + state.playerPaddleHeight / 2 - ball.y) * 0.04;
      } else if (((state.playerSide === 'left' && ball.dx > 0) || (state.playerSide === 'right' && ball.dx < 0)) && state.cpuMagnetTimer > 0) {
        ball.dy += (state.cpuY + state.cpuPaddleHeight / 2 - ball.y) * 0.04;
      }
    }

    ball.x += ball.dx * ball.speed;
    ball.y += ball.dy * ball.speed;

    // Bullet Reset
    if (ball.isBullet) {
      const field75 = GAME_WIDTH * 0.75;
      const crossed = (ball.dx > 0 && ball.x > field75) || (ball.dx < 0 && ball.x < (GAME_WIDTH - field75));
      if (crossed) {
        ball.isBullet = false;
        ball.speed = ball.originalSpeed;
      }
    }

    // Trail
    ball.history.push({ x: ball.x, y: ball.y });
    if (ball.history.length > 10) ball.history.shift();

    // Wall Bounce
    if (ball.y <= BALL_SIZE / 2 || ball.y >= GAME_HEIGHT - BALL_SIZE / 2) {
      ball.y = ball.y <= BALL_SIZE / 2 ? BALL_SIZE / 2 : GAME_HEIGHT - BALL_SIZE / 2;
      ball.dy *= -1;
      events.push({ type: 'BOUNCE' });
    }

    // Obstacles
    if (state.level >= 3) {
      state.obstacles.forEach(obs => {
        if (!obs.active) return;
        if (ball.x + BALL_SIZE/2 > obs.x && ball.x - BALL_SIZE/2 < obs.x + obs.width &&
            ball.y + BALL_SIZE/2 > obs.y && ball.y - BALL_SIZE/2 < obs.y + obs.height) {
          ball.dx *= -1;
          obs.active = false;
          events.push({ type: 'BOUNCE', small: true });
        }
      });
    }

    // Power-ups
    if (state.level >= 3) {
      state.powerUps.forEach(p => {
        if (!p.active) return;
        const dist = Math.sqrt((ball.x - p.x) ** 2 + (ball.y - p.y) ** 2);
        if (dist < BALL_SIZE / 2 + 15) {
          p.active = false;
          events.push({ type: 'POWERUP', powerUp: p.type });
          
          const beneficiary = ball.lastHitBy;
          if (beneficiary) {
            if (p.type === 'SIZE') {
              if (beneficiary === 'player') state.playerPaddleHeight = Math.min(GAME_HEIGHT - 60, state.playerPaddleHeight + 40);
              else state.cpuPaddleHeight = Math.min(GAME_HEIGHT - 60, state.cpuPaddleHeight + 40);
            } else if (p.type === 'SHRINK') {
              if (beneficiary === 'player') state.playerPaddleHeight = Math.max(30, state.playerPaddleHeight - 30);
              else state.cpuPaddleHeight = Math.max(30, state.cpuPaddleHeight - 30);
            } else if (p.type === 'FREEZE') {
              if (beneficiary === 'player') state.cpuFreezeTimer = 5000;
              else state.playerFreezeTimer = 5000;
            } else if (p.type === 'MAGNET') {
              if (beneficiary === 'player') state.playerMagnetTimer = 5000;
              else state.cpuMagnetTimer = 5000;
            } else if (p.type === 'MULTI') {
              state.multiballTimer = 5000;
              state.balls.push(spawnBall(ball.x, ball.y, beneficiary === 'player' ? (state.playerSide === 'left' ? 1 : -1) : (state.playerSide === 'left' ? -1 : 1), -ball.dy, ball.speed));
            } else if (p.type === 'BALA') {
              if (beneficiary === 'player') state.playerBulletTimer = 5000;
              else state.cpuBulletTimer = 5000;
            }
          }
        }
      });
    }

    // Paddle: Player
    const pLeft = state.playerSide === 'left' ? 10 : GAME_WIDTH - 10 - 40;
    const pRight = pLeft + 40;
    const isHitP = state.playerSide === 'left' 
      ? (ball.dx < 0 && ball.x - BALL_SIZE/2 <= pRight && ball.x + BALL_SIZE/2 >= pLeft)
      : (ball.dx > 0 && ball.x + BALL_SIZE/2 >= pLeft && ball.x - BALL_SIZE/2 <= pRight);
    
    if (isHitP && ball.y >= state.playerY && ball.y <= state.playerY + state.playerPaddleHeight) {
      ball.x = state.playerSide === 'left' ? pRight + BALL_SIZE/2 : pLeft - BALL_SIZE/2;
      ball.speed += 0.3;
      if (state.playerBulletTimer > 0) {
        ball.isBullet = true;
        ball.originalSpeed = ball.speed;
        ball.speed = Math.max(20, ball.speed * 2.5);
      }
      const res = calculateBounce(ball.y, state.playerY, state.playerPaddleHeight, ball.speed);
      ball.dx = state.playerSide === 'left' ? 1 : -1;
      ball.dy = res.vy / ball.speed;
      ball.lastHitBy = 'player';
      events.push({ type: 'PADDLE_HIT', side: 'player', bullet: state.playerBulletTimer > 0 });
    }

    // Paddle: CPU
    const cLeft = state.playerSide === 'left' ? GAME_WIDTH - 10 - 40 : 10;
    const cRight = cLeft + 40;
    const isHitC = state.playerSide === 'left'
      ? (ball.dx > 0 && ball.x + BALL_SIZE/2 >= cLeft && ball.x - BALL_SIZE/2 <= cRight)
      : (ball.dx < 0 && ball.x - BALL_SIZE/2 <= cRight && ball.x + BALL_SIZE/2 >= cLeft);

    if (isHitC && ball.y >= state.cpuY && ball.y <= state.cpuY + state.cpuPaddleHeight) {
      ball.x = state.playerSide === 'left' ? cLeft - BALL_SIZE/2 : cRight + BALL_SIZE/2;
      ball.speed += 0.3;
      if (state.cpuBulletTimer > 0) {
        ball.isBullet = true;
        ball.originalSpeed = ball.speed;
        ball.speed = Math.max(20, ball.speed * 2.5);
      }
      const res = calculateBounce(ball.y, state.cpuY, state.cpuPaddleHeight, ball.speed);
      ball.dx = state.playerSide === 'left' ? -1 : 1;
      ball.dy = res.vy / ball.speed;
      ball.lastHitBy = 'cpu';
      events.push({ type: 'PADDLE_HIT', side: 'cpu', bullet: state.cpuBulletTimer > 0 });
    }

    if (ball.x < -BALL_SIZE || ball.x > GAME_WIDTH + BALL_SIZE) {
      // If ball.x < -BALL_SIZE, Left side was scored on. Scoring side is RIGHT.
      // If player is LEFT, ball.x < -BALL_SIZE means CPU scored.
      
      let playerScored = false;
      if (ball.x < -BALL_SIZE) {
         playerScored = state.playerSide === 'right';
      } else {
         playerScored = state.playerSide === 'left';
      }

      events.push({ type: 'SCORE', playerScored });
      
      if (playerScored) state.cpuBulletTimer = 0;
      else state.playerBulletTimer = 0;

      if (state.balls.length > 1) {
        state.balls.splice(idx, 1);
      } else {
        resetBall(ball, !playerScored); // Serve to whoever lost
        if (state.level >= 3) spawnObstacles();
      }
    }
  });

  // Post state back
  (self as unknown as Worker).postMessage({ type: 'STATE_UPDATE', state, events });
}

let loopInterval: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e) => {
  const { type, payload } = e.data;
  switch (type) {
    case 'START':
      state.playerSide = payload.playerSide;
      state.level = payload.level;
      state.balls = [spawnBall(GAME_WIDTH / 2, GAME_HEIGHT / 2, state.playerSide === 'left' ? -1 : 1, 0, INITIAL_BALL_SPEED)];
      state.playerPaddleHeight = PADDLE_HEIGHT;
      state.cpuPaddleHeight = PADDLE_HEIGHT;
      state.playerY = (GAME_HEIGHT - PADDLE_HEIGHT) / 2;
      state.cpuY = (GAME_HEIGHT - PADDLE_HEIGHT) / 2;
      state.powerUps = [];
      spawnObstacles();
      if (loopInterval) clearInterval(loopInterval);
      loopInterval = setInterval(updatePhysics, 16.67);
      break;
    case 'UPDATE_PADDLE':
      state.playerY = payload.y;
      break;
    case 'UPDATE_LEVEL':
      state.level = payload.level;
      break;
    case 'STOP':
      if (loopInterval) clearInterval(loopInterval);
      loopInterval = null;
      break;
  }
};
