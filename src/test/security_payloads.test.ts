
import { describe, it, expect } from 'vitest';
import { validateSignalPayload } from '../features/networking/lib/validateSignalPayload';

describe('Signaling Payload Validation', () => {
    it('should accept valid offer payloads', () => {
        const valid = { type: 'offer', sdp: { type: 'offer', sdp: 'valid-sdp' } };
        expect(validateSignalPayload(valid)).toBe(true);
    });

    it('should reject unknown types', () => {
        const invalid = { type: 'pwn', payload: 'bad' };
        expect(validateSignalPayload(invalid)).toBe(false);
    });

    it('should reject oversized payloads (check DoS prevention)', () => {
        const massive = { type: 'offer', sdp: 'x'.repeat(11000) }; // Limit is 10k (10240)
        expect(validateSignalPayload(massive)).toBe(false);
    });

    it('should reject malformed ice candidates', () => {
        const badCand = { type: 'ice-candidate', candidate: { candidate: 123 } }; // Not string
        expect(validateSignalPayload(badCand)).toBe(false);
    });

    it('should accept GAME_UPDATE SYNC_DICE with valid dice (H2H dice sync)', () => {
        const valid = { type: 'GAME_UPDATE', event: 'SYNC_DICE', payload: { dice: [3, 4] } };
        expect(validateSignalPayload(valid)).toBe(true);
    });

    it('should reject GAME_UPDATE SYNC_DICE with invalid dice', () => {
        const bad = { type: 'GAME_UPDATE', event: 'SYNC_DICE', payload: { dice: [0, 7] } };
        expect(validateSignalPayload(bad)).toBe(false);
        const notDice = { type: 'GAME_UPDATE', event: 'SYNC_DICE', payload: { dice: '6-1' } };
        expect(validateSignalPayload(notDice)).toBe(false);
    });

    it('should reject GAME_UPDATE with unknown event (no injection of arbitrary events)', () => {
        const bad = { type: 'GAME_UPDATE', event: 'DROP_TABLE', payload: {} };
        expect(validateSignalPayload(bad)).toBe(false);
    });

    it('should accept valid chat messages (H2H text chat)', () => {
        const valid = { type: 'chat-message', payload: 'Hola, doble?' };
        expect(validateSignalPayload(valid)).toBe(true);
    });

    it('should reject chat messages with non-string payload', () => {
        const bad = { type: 'chat-message', payload: 42 };
        expect(validateSignalPayload(bad)).toBe(false);
        const nested = { type: 'chat-message', payload: { text: 'hola' } };
        expect(validateSignalPayload(nested)).toBe(false);
    });

    it('should reject empty or whitespace-only chat messages', () => {
        expect(validateSignalPayload({ type: 'chat-message', payload: '' })).toBe(false);
        expect(validateSignalPayload({ type: 'chat-message', payload: '   ' })).toBe(false);
    });

    it('should reject chat messages over the length limit', () => {
        const tooLong = { type: 'chat-message', payload: 'x'.repeat(2001) };
        expect(validateSignalPayload(tooLong)).toBe(false);
        expect(validateSignalPayload({ type: 'chat-message', payload: 'x'.repeat(2000) })).toBe(true);
    });
});
