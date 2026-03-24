/**
 * OneEuroFilter.ts
 * 
 * A standard implementation of the 1€ Filter for stabilizing noisy input signals (like hand tracking)
 * minimizing lag while reducing jitter.
 * 
 * Ref: Casiez, G., Roussel, N., & Vogel, D. (2012). "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems."
 */

export class OneEuroFilter {
    minCutoff: number;
    beta: number;
    dCutoff: number;
    x: LowPassFilter | null;
    dx: LowPassFilter | null;
    startTime: number | null;
  
    constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
      this.minCutoff = minCutoff;
      this.beta = beta;
      this.dCutoff = dCutoff;
      this.x = null;
      this.dx = null;
      this.startTime = null;
    }
  
    reset() {
      this.x = null;
      this.dx = null;
      this.startTime = null;
    }
  
    filter(value: number, timestamp: number = performance.now()): number {
      // Initialize on first input
      if (this.startTime === null) {
        this.startTime = timestamp;
        this.x = new LowPassFilter(this.alpha(this.minCutoff));
        this.dx = new LowPassFilter(this.alpha(this.dCutoff));
        this.x.setLastValue(value);
        return value;
      }
  
      // Calculate discrete derivative (velocity)
      // d_cutoff = 1.0 Hz usually good for derivative
      const dt = (timestamp - this.startTime) / 1000; // seconds
      this.startTime = timestamp; // Update for next frame
      
      // Avoid div by zero
      if (dt <= 0) return this.x!.lastValue(); 
  
      const dx = (value - this.x!.lastValue()) / dt;
      const edx = this.dx!.filter(dx, this.alpha(this.dCutoff, dt)); // Smoothed velocity
  
      // Calculate cutoff frequency based on speed
      // cutoff = minCutoff + beta * |edx|
      // If moving fast -> High cutoff -> Less filtering (Low lag)
      // If moving slow -> Low cutoff -> More filtering (High stability)
      const cutoff = this.minCutoff + this.beta * Math.abs(edx);
  
      // Filter the main signal
      return this.x!.filter(value, this.alpha(cutoff, dt));
    }
  
    private alpha(cutoff: number, dt: number = 1/60): number {
      const tau = 1.0 / (2 * Math.PI * cutoff);
      return 1.0 / (1.0 + tau / dt);
    }
  }
  
  class LowPassFilter {
    a: number;
    y: number;
    s: number;
    hasLastValue: boolean;
  
    constructor(alpha: number, initval: number = 0) {
      this.a = alpha;
      this.y = initval;
      this.s = initval;
      this.hasLastValue = false;
    }
  
    lastValue() { return this.y; }
  
    setLastValue(v: number) {
      this.y = v;
      this.s = v;
      this.hasLastValue = true;
    }
    
    filter(value: number, alpha: number) {
       this.a = alpha; // Dynamic alpha update
       
       if (!this.hasLastValue) {
           this.y = value;
           this.s = value;
           this.hasLastValue = true;
           return value;
       }
       
       // Exponential Smoothing: s = a*x + (1-a)*s_prev
       this.s = this.a * value + (1.0 - this.a) * this.s;
       this.y = this.s;
       return this.y;
    }
  }
