import { useEffect, useRef, useState } from 'react';

/**
 * Hook that delays showing loading state to prevent flashing/stuttering
 * for fast operations
 *
 * @param isLoading - The actual loading state
 * @param delay - Delay in milliseconds before showing loading (default: 500ms)
 * @returns Whether to show the loading state
 */
export function useDelayedLoading(
  isLoading: boolean,
  delay: number = 500,
): boolean {
  const [showLoading, setShowLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Start a timer to show loading after delay
      timeoutRef.current = setTimeout(() => {
        setShowLoading(true);
      }, delay);
    } else {
      // Clear timeout and hide loading immediately when done
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setShowLoading(false);
    }

    // Cleanup on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isLoading, delay]);

  return showLoading;
}
