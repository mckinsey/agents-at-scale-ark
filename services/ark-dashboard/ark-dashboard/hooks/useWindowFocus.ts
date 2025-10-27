import { useCallback, useEffect, useRef } from 'react';

type UseWindowFocusOptions = {
  enabled?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
};

export function useWindowFocus(options: UseWindowFocusOptions = {}) {
  const { onFocus, onBlur, enabled = true } = options;

  // Use refs to store the latest callback functions
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);
  const hasBeenBlurredRef = useRef(false);

  // Update refs when callbacks change
  useEffect(() => {
    onFocusRef.current = onFocus;
  }, [onFocus]);

  useEffect(() => {
    onBlurRef.current = onBlur;
  }, [onBlur]);

  const handleFocus = useCallback(() => {
    if (hasBeenBlurredRef.current && onFocusRef.current) {
      onFocusRef.current();
    }
  }, []);

  const handleBlur = useCallback(() => {
    hasBeenBlurredRef.current = true;
    if (onBlurRef.current) {
      onBlurRef.current();
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [enabled, handleFocus, handleBlur]);
}
