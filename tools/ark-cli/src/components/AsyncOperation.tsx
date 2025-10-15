import {useInput} from 'ink';
import * as React from 'react';
import {StatusMessage} from './StatusMessage.js';
import {SelectMenu} from './SelectMenu.js';

export interface AsyncOperationConfig {
  /** Message to display during operation */
  message: string;
  /** Async function to execute */
  operation: (signal: AbortSignal) => Promise<void>;
  /** Optional tip displayed below message */
  tip?: string;
  /** Show "(esc to interrupt)" hint */
  showInterrupt?: boolean;
  /** Hide UI on success */
  hideOnSuccess?: boolean;
  /** Called when operation fails */
  onError?: (error: Error) => void;
  /** Error menu options with callbacks */
  errorOptions?: Array<{label: string; onSelect: () => void}>;
}

interface AsyncOperationState {
  /** Current operation state - idle: not running/cleared, loading: executing, success: completed, error: failed */
  status: 'idle' | 'loading' | 'success' | 'error';
  /** Message shown during loading and success */
  message: string;
  /** Optional tip text shown below message during loading */
  tip?: string;
  /** Brief error message when status is error */
  error?: string;
  /** Full error details/stack trace when status is error */
  errorDetails?: string;
  /** Whether to show interrupt hint during loading */
  showInterrupt: boolean;
  /** Whether to hide UI after success */
  hideOnSuccess: boolean;
  /** Menu options shown when status is error */
  errorOptions: Array<{label: string; onSelect: () => void}>;
}

export function useAsyncOperation() {
  const [state, setState] = React.useState<AsyncOperationState>({
    status: 'idle',
    message: '',
    showInterrupt: false,
    hideOnSuccess: false,
    errorOptions: [],
  });

  const abortControllerRef = React.useRef<AbortController | null>(null);
  const configRef = React.useRef<AsyncOperationConfig | null>(null);

  const run = React.useCallback(async (config: AsyncOperationConfig) => {
    configRef.current = config;

    const retry = () => {
      if (configRef.current) {
        run(configRef.current);
      }
    };

    const errorOptions = config.errorOptions || [
      {label: 'Try again', onSelect: retry},
      {label: 'Quit', onSelect: () => process.exit(0)},
    ];

    setState({
      status: 'loading',
      message: config.message,
      tip: config.tip,
      showInterrupt: config.showInterrupt ?? false,
      hideOnSuccess: config.hideOnSuccess ?? false,
      errorOptions,
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await config.operation(controller.signal);
      setState((prev) => ({...prev, status: 'success'}));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setState((prev) => ({...prev, status: 'idle'}));
        return;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: error.message,
        errorDetails: error.stack,
      }));

      config.onError?.(error);
    } finally {
      abortControllerRef.current = null;
    }
  }, []);

  const interrupt = React.useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState((prev) => ({...prev, status: 'idle'}));
  }, []);

  const retry = React.useCallback(() => {
    if (configRef.current) {
      run(configRef.current);
    }
  }, [run]);

  const clear = React.useCallback(() => {
    setState({
      status: 'idle',
      message: '',
      showInterrupt: false,
      hideOnSuccess: false,
      errorOptions: [],
    });
  }, []);

  return {
    state,
    run,
    interrupt,
    retry,
    clear,
  };
}

export type AsyncOperation = ReturnType<typeof useAsyncOperation>;

interface AsyncOperationStatusProps {
  operation: AsyncOperation;
}

export const AsyncOperationStatus: React.FC<AsyncOperationStatusProps> = ({
  operation,
}) => {
  const {state} = operation;

  useInput((input, key) => {
    if (state.status === 'loading' && state.showInterrupt && key.escape) {
      operation.interrupt();
      return;
    }
  });

  if (state.status === 'idle') {
    return null;
  }

  if (state.status === 'success' && state.hideOnSuccess) {
    return null;
  }

  if (state.status === 'loading') {
    return (
      <StatusMessage
        status="loading"
        message={state.message}
        hint={state.showInterrupt ? '(esc to interrupt)' : undefined}
        tip={state.tip}
      />
    );
  }

  if (state.status === 'success') {
    return <StatusMessage status="success" message={state.message} />;
  }

  if (state.status === 'error') {
    return (
      <StatusMessage
        status="error"
        message={state.message}
        details={state.error}
        errorMessage={state.errorDetails}
      >
        <SelectMenu items={state.errorOptions} />
      </StatusMessage>
    );
  }

  return null;
};
