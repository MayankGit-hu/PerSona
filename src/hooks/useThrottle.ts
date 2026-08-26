import { useState, useRef, useEffect } from 'react';

// Throttle a value — limits expensive downstream computations (e.g. ReactMarkdown re-parse)
// to at most once per `intervalMs`. This prevents 40+ re-parses/second during LLM streaming.
export function useThrottle<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState<T>(value);
  const lastFired = useRef<number>(0);
  
  useEffect(() => {
    const now = Date.now();
    if (now - lastFired.current >= intervalMs) {
      lastFired.current = now;
      setThrottled(value);
    }
  }, [value, intervalMs]);
  
  return throttled;
}
