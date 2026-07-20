'use client';

import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { inputVariantStyles } from './input';

const textareaVariants = cva(
  'flex w-full rounded-none outline-none transition-[border-color,box-shadow,background-color] font-normal min-h-16 selection:bg-fill-active selection:text-fg-primary-inverse',
  {
    variants: {
      variant: {
        default: [
          inputVariantStyles.default.base,
          inputVariantStyles.default.text,
          inputVariantStyles.default.hover,
          'focus-visible:bg-stateslayer-overlay-active-inverse focus-visible:ring-stroke-status-focus',
          inputVariantStyles.default.error,
          inputVariantStyles.default.disabled,
          'disabled:bg-stateslayer-overlay-disabled',
        ],
      },
      size: {
        sm: 'paragraph-small-primary p-3 focus-visible:ring-[1px]',
        default: 'paragraph-regular-primary p-3 focus-visible:ring-[1px]',
        lg: 'paragraph-large-primary p-3 focus-visible:ring-[2px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type TextareaContextValue = {
  hasRoot: boolean;
  count: number;
  maxCharacters?: number;
  registerTextarea: (ref: HTMLTextAreaElement | null) => void;
  formProps?: Pick<
    React.ComponentProps<'textarea'>,
    'aria-invalid' | 'aria-describedby' | 'id'
  >;
};

const TextareaContext = React.createContext<TextareaContextValue>({
  hasRoot: false,
  count: 0,
  registerTextarea: () => {},
});

interface TextareaRootProps extends React.ComponentProps<'div'> {
  maxCharacters?: number;
  size?: 'sm' | 'default' | 'lg';
}

const textareaFontSizeBySize = {
  sm: 'paragraph-small-primary',
  default: 'paragraph-regular-primary',
  lg: 'paragraph-large-primary',
} as const;

function TextareaRoot({
  className,
  children,
  maxCharacters,
  size,
  ...props
}: Readonly<TextareaRootProps>) {
  const [count, setCount] = React.useState(0);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Extract form-related props that should be passed to the textarea, strip from div.
  const formProps = React.useMemo<TextareaContextValue['formProps']>(
    () => ({
      'aria-invalid': props['aria-invalid'],
      'aria-describedby': props['aria-describedby'],
      id: props.id,
    }),
    [props['aria-invalid'], props['aria-describedby'], props.id],
  );
  const {
    'aria-invalid': _a,
    'aria-describedby': _b,
    id: _id,
    ...divProps
  } = props;

  const registerTextarea = React.useCallback(
    (ref: HTMLTextAreaElement | null) => {
      textareaRef.current = ref;
      if (ref) {
        setCount(ref.value.length);
      }
    },
    [],
  );

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleInput = () => {
      setCount(textarea.value.length);
    };

    textarea.addEventListener('input', handleInput);
    return () => textarea.removeEventListener('input', handleInput);
  }, []);

  const fontSize = textareaFontSizeBySize[size ?? 'default'];

  const contextValue = React.useMemo<TextareaContextValue>(
    () => ({
      hasRoot: true,
      count,
      maxCharacters,
      registerTextarea,
      formProps,
    }),
    [count, maxCharacters, registerTextarea, formProps],
  );

  return (
    <TextareaContext.Provider value={contextValue}>
      <div
        className={cn('flex flex-col gap-2', fontSize, className)}
        {...divProps}>
        {children}
      </div>
    </TextareaContext.Provider>
  );
}

function TextareaCounter({
  className,
  ...props
}: Readonly<Omit<React.ComponentProps<'div'>, 'children'>>) {
  const { count, maxCharacters } = React.useContext(TextareaContext);

  if (!maxCharacters) {
    console.warn(
      'TextareaCounter requires maxCharacters to be set on TextareaRoot',
    );
    return null;
  }

  const isOverLimit = count > maxCharacters;

  return (
    <div
      className={cn(
        'text-fg-secondary ml-auto flex items-center gap-0.5',
        className,
      )}
      {...props}>
      <span
        className={cn(
          count > 0 && !isOverLimit && 'text-fg-primary',
          isOverLimit && 'text-status-error',
        )}>
        {count}
      </span>
      <span>/</span>
      <span>{maxCharacters}</span>
    </div>
  );
}

interface TextareaProps
  extends
    React.ComponentProps<'textarea'>,
    VariantProps<typeof textareaVariants> {
  autoResize?: boolean;
  maxRows?: number;
  ref?: React.Ref<HTMLTextAreaElement>;
}

function Textarea({
  className,
  variant,
  size,
  value,
  defaultValue,
  onChange,
  autoResize = false,
  maxRows,
  ref,
  ...props
}: Readonly<TextareaProps>) {
  const context = React.useContext(TextareaContext);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  const setRefs = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current =
          node;
      }
    },
    [ref],
  );

  const resize = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el || !autoResize) return;

    el.style.height = 'auto';

    const styles = globalThis.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const borderTop = Number.parseFloat(styles.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(styles.borderBottomWidth) || 0;
    const verticalExtra = paddingTop + paddingBottom + borderTop + borderBottom;

    // scrollHeight includes padding but not border under border-box.
    const fullHeight = el.scrollHeight + borderTop + borderBottom;

    if (maxRows) {
      const maxHeight = lineHeight * maxRows + verticalExtra;
      const overflow = fullHeight > maxHeight + 1;
      el.style.height = `${Math.min(fullHeight, maxHeight)}px`;
      el.style.overflowY = overflow ? 'auto' : 'hidden';
      setIsOverflowing(overflow);
    } else {
      el.style.height = `${fullHeight}px`;
      el.style.overflowY = 'hidden';
      setIsOverflowing(false);
    }
  }, [autoResize, maxRows]);

  React.useLayoutEffect(() => {
    resize();
  }, [resize, value]);

  React.useEffect(() => {
    if (context.hasRoot && textareaRef.current) {
      context.registerTextarea(textareaRef.current);
    }
  }, [context]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e);
    resize();
  };

  const hasCharacterLimitError =
    context.maxCharacters && context.count > context.maxCharacters;

  // Merge form props from context with component props.
  // Explicit props passed directly to Textarea win via {...props}.
  const formInvalidProp = context.formProps?.['aria-invalid'];
  const isInvalid = formInvalidProp || hasCharacterLimitError || undefined;

  const textarea = (
    <textarea
      ref={setRefs}
      data-slot="textarea"
      className={cn(
        textareaVariants({ variant, size }),
        autoResize && 'resize-none',
        className,
      )}
      value={value}
      defaultValue={defaultValue}
      onChange={handleChange}
      aria-invalid={isInvalid}
      aria-describedby={context.formProps?.['aria-describedby']}
      id={context.formProps?.id}
      {...props}
    />
  );

  if (!autoResize) {
    return textarea;
  }

  return (
    <div className="relative w-full">
      {textarea}
      {isOverflowing && (
        <div
          aria-hidden="true"
          className="from-surface-bg-primary pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t to-transparent"
        />
      )}
    </div>
  );
}

export { Textarea, TextareaRoot, TextareaCounter, textareaVariants };

export type { TextareaProps };
