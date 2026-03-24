import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBoardGeometry } from './useBoardGeometry';

describe('useBoardGeometry', () => {
  let observeMock: ReturnType<typeof vi.fn>;
  let disconnectMock: ReturnType<typeof vi.fn>;
  let resizeCallback: ResizeObserverCallback | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    observeMock = vi.fn();
    disconnectMock = vi.fn();
    resizeCallback = null;

    // Class-based mock for ResizeObserver
    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe = observeMock;
      disconnect = disconnectMock;
      unobserve = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    // Mock requestAnimationFrame to execute immediately
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should initialize with null geometry', () => {
    const { result } = renderHook(() => useBoardGeometry());
    expect(result.current.geometry).toBeNull();
  });

  it('should measure geometry when callback ref is invoked', () => {
    const { result } = renderHook(() => useBoardGeometry());

    const mockElement = document.createElement('div');
    const mockRect = {
      top: 100,
      left: 100,
      width: 500,
      height: 500,
      bottom: 600,
      right: 600,
      x: 100,
      y: 100,
      toJSON: () => {},
    };
    
    vi.spyOn(mockElement, 'getBoundingClientRect').mockReturnValue(mockRect as DOMRect);

    // Simulate ref attachment via Callback Ref
    act(() => {
      result.current.boardRef(mockElement);
    });

    expect(observeMock).toHaveBeenCalledWith(mockElement);

    // Trigger ResizeObserver callback to ensure geometry is updated via RAF
    act(() => {
      if (resizeCallback) {
        resizeCallback([], {} as ResizeObserver);
      }
    });

    expect(result.current.geometry).toEqual({
      top: 100,
      left: 100,
      width: 500,
      height: 500,
    });
  });

  it('should clean up observers on unmount', () => {
    const { result } = renderHook(() => useBoardGeometry());
    
    const mockElement = document.createElement('div');
    
    // Attach
    act(() => {
      result.current.boardRef(mockElement);
    });

    // Detach (simulating unmount behavior or ref callback with null)
    act(() => {
      result.current.boardRef(null);
    });

    expect(disconnectMock).toHaveBeenCalled();
  });
});
