'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';

type NavigationPredicate = () => boolean;

interface NavigationGuardContextValue {
  requestNavigation: (navigate: () => void) => boolean;
  setPredicate: (predicate: NavigationPredicate | null) => void;
  navigateHref: (href: string) => void;
}

const defaultContextValue: NavigationGuardContextValue = {
  requestNavigation: () => false,
  setPredicate: () => {},
  navigateHref: () => {},
};

const NavigationGuardContext =
  createContext<NavigationGuardContextValue>(defaultContextValue);

export function NavigationGuardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const predicateRef = useRef<NavigationPredicate | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);

  const setPredicate = useCallback((predicate: NavigationPredicate | null) => {
    predicateRef.current = predicate;
  }, []);

  const navigateHref = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  const requestNavigation = useCallback((navigate: () => void) => {
    if (predicateRef.current?.()) {
      pendingRef.current = navigate;
      setOpen(true);
      return true;
    }
    return false;
  }, []);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    const navigate = pendingRef.current;
    pendingRef.current = null;
    navigate?.();
  }, []);

  const handleCancel = useCallback(() => {
    setOpen(false);
    pendingRef.current = null;
  }, []);

  return (
    <NavigationGuardContext.Provider
      value={{ requestNavigation, setPredicate, navigateHref }}>
      {children}
      <ConfirmationDialog
        open={open}
        onOpenChange={next => {
          if (!next) {
            handleCancel();
          }
        }}
        title="Discard unsaved changes?"
        description="You have unsaved changes that will be lost if you leave this page."
        confirmText="Discard changes"
        cancelText="Keep editing"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        variant="destructive"
      />
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuardContext(): NavigationGuardContextValue {
  return useContext(NavigationGuardContext);
}

export interface UseUnsavedChangesGuardResult {
  bypass: (navigate: () => void) => void;
}

export function useUnsavedChangesGuard(
  isDirty: boolean,
): UseUnsavedChangesGuardResult {
  const { setPredicate } = useNavigationGuardContext();
  const bypassRef = useRef(false);

  useEffect(() => {
    setPredicate(() => isDirty && !bypassRef.current);
    return () => {
      setPredicate(null);
    };
  }, [isDirty, setPredicate]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [isDirty]);

  const bypass = useCallback((navigate: () => void) => {
    bypassRef.current = true;
    navigate();
    queueMicrotask(() => {
      bypassRef.current = false;
    });
  }, []);

  return { bypass };
}
