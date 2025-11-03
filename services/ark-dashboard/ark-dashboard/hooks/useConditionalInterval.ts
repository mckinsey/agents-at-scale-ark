import { useEffect, useRef } from 'react';

type UseConditionalIntervalOptions = {
  callback: () => void;
  delay: number;
  condition: boolean;
};

export function useConditionalInterval({
  callback,
  delay,
  condition,
}: UseConditionalIntervalOptions) {
  const savedCallback = useRef<(() => void) | null>(null);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    function tick() {
      if (savedCallback.current) {
        savedCallback.current();
      }
    }

    // Only set up interval if condition is true and delay is not null
    if (condition) {
      const id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay, condition]);
}
