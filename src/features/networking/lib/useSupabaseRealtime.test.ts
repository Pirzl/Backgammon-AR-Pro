import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSupabaseRealtime } from './useSupabaseRealtime';

// Mock Supabase
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn(),
  track: vi.fn(),
  send: vi.fn(),
  presenceState: vi.fn().mockReturnValue({}),
  unsubscribe: vi.fn(), // Added for cleanup in useEffect
};

vi.mock('../../../shared/api/supabase', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}));

describe('useSupabaseRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a channel on mount', () => {
    renderHook(() => useSupabaseRealtime('room-1', 'user-1'));
    // We expect the mock to have been called
    // Since we mocked the import, we can't easily check the mock without exporting it or using spyOn on the module.
    // However, for this basic smoke test, if it doesn't crash, it's a good start.
    // Better: Verify subscribe was called.
    expect(mockChannel.on).toHaveBeenCalledWith('presence', expect.any(Object), expect.any(Function));
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });
});
