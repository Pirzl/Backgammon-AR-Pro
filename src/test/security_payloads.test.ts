
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
});
