/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */

// ----------------------------------------------------------------------
// CLASSIC WORKER SHIM FOR MEDIAPIPE
// ----------------------------------------------------------------------
// The `vision_bundle.js` from npm is a CommonJS/UMD bundle that expects
// `exports` to be available. We shim it here to load it in a classic worker.
// CRITICAL: Must use `self.exports` (global property) instead of `const exports` (local variable).
// Vite wraps workers in an IIFE and Rollup minifies local vars, so `const exports` becomes
// `const p = {}` — but vision_bundle.js expects a GLOBAL `exports` object.
(self as any).exports = {};
importScripts('/mediapipe/vision_bundle.js');
const { FilesetResolver, HandLandmarker } = (self as any).exports;
// ----------------------------------------------------------------------

// --- SECURITY: NETWORK BLOCKING UTILITIES ---
const enforceNetworkBlock = () => {
  const block = (name: string) => () => { 
      throw new Error(`Security: ${name} access denied in worker (Network Lockdown)`); 
  };
  
  // Block common network primitives
  if (typeof fetch !== 'undefined') (self as any).fetch = block('fetch');
  if (typeof XMLHttpRequest !== 'undefined') (self as any).XMLHttpRequest = block('XMLHttpRequest');
  if (typeof WebSocket !== 'undefined') (self as any).WebSocket = block('WebSocket');
  if (typeof importScripts !== 'undefined') (self as any).importScripts = block('importScripts');
};
// ----------------------------------------------------------------------

/**
 * Hand Detection Worker - Classic Edition (Local Assets)
 * Uses local `importScripts` and local WASM assets.
 */

// Global state
let handLandmarker: any = null;
let isInitialized = false;

const initializeHandLandmarker = async (modelBuffer: ArrayBuffer) => {
  // Pre-check: Ensure we have network access initially (for debugging) or fail fast if environment is already broken
  if (typeof fetch !== 'function') {
      console.warn('[Worker] fetch is missing before lockdown. This might be intended in offline-only mode.');
  }

  try {
    console.log('[Worker] Initializing HandLandmarker (Classic/Local)...');
    
    // Use the LOCAL path for WASM files (served from public/mediapipe/wasm)
    const vision = await FilesetResolver.forVisionTasks(
        "/mediapipe/wasm" // Point to the directory containing the WASM files
    );
    
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetBuffer: new Uint8Array(modelBuffer),
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 1
    });
    console.log('[Worker] HandLandmarker created:', !!handLandmarker);

    isInitialized = true;

    // --- SECURITY: ENGAGE LOCKDOWN ---
    // Now that WASM and Model are loaded, we cut the cord.
    enforceNetworkBlock();
    console.log('[Worker] Security Lockdown Active');
    
    self.postMessage({ type: 'LOADED' });
    
  } catch (error: unknown) {
    console.error('[Worker] Initialization error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage({ 
      type: 'ERROR', 
      error: `Hand tracking initialization failed: ${errorMessage}` 
    });
  }
};

/**
 * Process incoming messages from main thread
 */
let isProcessing = false;
const MAX_RETRIES = 3;

self.onmessage = async (event: MessageEvent) => {
  const { type, videoFrame, timestamp, modelBuffer } = event.data;

  if (type === 'LOAD') {
    if (!isInitialized) {
      if (!modelBuffer) {
        self.postMessage({ type: 'ERROR', error: 'Model buffer required' });
        return;
      }
      await initializeHandLandmarker(modelBuffer);
    }
  } 
  else if (type === 'DETECT') {
    // --- CONCURRENCY GUARD ---
    if (isProcessing) {
      return;
    }
    
    isProcessing = true;

    // Process video frame for hand detection
    if (handLandmarker && videoFrame) {
      let attempts = 0;
      let success = false;
      const startTimeMs = performance.now();

      // --- RETRY LOGIC ---
      while (attempts < MAX_RETRIES && !success) {
        try {
          // Note: timestamp must be monotonic for MediaPipe
          // FIX: Handle ImageData (from fallback) which requires .detect(), vs .detectForVideo() for ImageBitmap
          const result = (videoFrame.data && videoFrame.width) 
            ? handLandmarker.detect(videoFrame) 
            : handLandmarker.detectForVideo(videoFrame, timestamp);
          const latency = performance.now() - startTimeMs;
          
          self.postMessage({ 
            type: 'RESULT', 
            landmarks: result,
            latency 
          });
          success = true;

        } catch (error) {
          attempts++;
          console.warn(`HandTracking: Retry ${attempts}/${MAX_RETRIES} due to:`, error);
          
          if (attempts >= MAX_RETRIES) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            self.postMessage({ 
              type: 'ERROR', 
              error: `Detection failed after ${MAX_RETRIES} retries: ${errorMessage}` 
            });
          }
        }
      }
    }

    // Release Guard
    isProcessing = false;
  }
};
