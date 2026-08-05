/**
 * Validates incoming signaling payloads to prevent injection attacks,
 * logic errors, and Denial of Service (DoS) via oversized payloads.
 */

// Maximum allowed payload size in bytes (10KB)
const MAX_PAYLOAD_SIZE = 10 * 1024;

// Maximum length of a chat message payload (in characters).
const MAX_CHAT_MESSAGE_LENGTH = 2000;

const ALLOWED_TYPES = ["offer", "answer", "ice-candidate", "cursor", "GAME_UPDATE", "chat-message"];





export function validateSignalPayload(payload: unknown): boolean {
  // 1. Basic Type Check
  if (!payload || typeof payload !== "object") {
    console.warn("[Security] Invalid payload: not an object");
    return false;
  }

  // 2. Size Check (prevent DoS)
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_PAYLOAD_SIZE) {
    console.warn(
      `[Security] Payload validation failed: Size ${serialized.length} exceeds limit ${MAX_PAYLOAD_SIZE}`,
    );
    return false;
  }

  // 3. Schema Validation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payload as Record<string, any>;

  if (typeof p.type !== "string" || !ALLOWED_TYPES.includes(p.type)) {
    console.warn(`[Security] Invalid payload type: ${p.type}`);
    return false;
  }

  // 4. Content Validation based on type
  try {
    switch (p.type) {
      case "offer":
      case "answer":
        // Ensure SDP is present and a string
        if (typeof p.sdp !== "object" && typeof p.sdp !== "string") {
            return false;
        }
        if (typeof p.sdp === 'object' && (p.sdp === null || typeof p.sdp.sdp !== "string")) return false;
        break;

      case "ice-candidate":
        // Validate candidate structure
        if (!p.candidate || typeof p.candidate !== "object") return false;
        
        // Candidate string check & Length Guard (User P0)
        if (typeof p.candidate.candidate !== "string") {
            return false;
        }
        if (p.candidate.candidate.length > 10000) {
            console.warn('[Security] Candidate too long');
            return false;
        }
        break;

      case "cursor":
        // Validate coordinates are numbers
        if (typeof p.x !== "number" || typeof p.y !== "number") return false;
        if (typeof p.gesture !== "string") return false;
        break;

      case "GAME_UPDATE": {
        // Validate game update structure
        if (typeof p.event !== "string") return false;
        const allowedEvents = ["ROLL_DICE", "SYNC_DICE", "MOVE_CHECKER", "UNDO_MOVE", "NEW_GAME", "CONFIRM_TURN_END", "OFFER_DOUBLE", "TAKE_DOUBLE", "DROP_DOUBLE"];
        if (!allowedEvents.includes(p.event)) return false;
        
        // Validate payload based on event type
        if ((p.event === "ROLL_DICE" || p.event === "SYNC_DICE") && p.payload?.dice) {
          if (!Array.isArray(p.payload.dice) || p.payload.dice.length === 0) return false;
          if (p.payload.dice.some((d: unknown) => typeof d !== "number" || d < 1 || d > 6)) return false;
        }
        if (p.event === "MOVE_CHECKER" && p.payload?.move) {
          const move = p.payload.move;
          if (typeof move.from !== "number" || typeof move.to !== "number" || typeof move.die !== "number") return false;
        }
        if (p.event === "OFFER_DOUBLE" || p.event === "TAKE_DOUBLE" || p.event === "DROP_DOUBLE") {
          // Doubling events don't need extra payload validation beyond event type
          if (p.payload && typeof p.payload !== "object") return false;
        }
        break;
      }

      case "chat-message":
        // Validate the chat payload is a trimmed non-empty string within limits.
        if (typeof p.payload !== "string") return false;
        if (p.payload.trim().length === 0) return false;
        if (p.payload.length > MAX_CHAT_MESSAGE_LENGTH) return false;
        break;

      default:
        return false;
    }
  } catch (err) {
    console.error("[Security] Validation error:", err);
    return false;
  }

  return true;
}
