import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react';
import { useToasts } from '../lib/toast';

/** Component library (§3.6) — Tailwind + cva, styled per design/00-system-sheet. */

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
    'disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-white hover:bg-accent-deep',
        secondary: 'bg-pitch text-mint hover:bg-pitch-deep',
        danger: 'bg-danger text-white hover:opacity-90',
        ghost: 'bg-transparent text-pitch hover:bg-pitch/10',
      },
      size: {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-5 py-2.5 text-sm',
        lg: 'px-7 py-3 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={button({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
});

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`${className} inline-block animate-spin rounded-full border-2 border-current border-t-transparent`}
    />
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: string;
}

/** Input with always-rendered label + aria-describedby error (§3.6 a11y). */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, id, className, ...rest },
  ref,
) {
  const fieldId = id ?? `field-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none transition-colors ${
          error ? 'border-danger' : 'border-sage/40 focus:border-pitch'
        } ${className ?? ''}`}
        {...rest}
      />
      {hint && !error && <p className="text-xs text-sage">{hint}</p>}
      {error && (
        <p id={`${fieldId}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});

export function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-white px-6 py-14 text-center">
      <span aria-hidden className="text-4xl">
        ⚽
      </span>
      <h3 className="font-display text-xl uppercase tracking-wide text-pitch">{title}</h3>
      <p className="max-w-sm text-sm text-sage">{body}</p>
      {cta}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start justify-between gap-3 rounded-card px-4 py-3 text-sm font-medium text-white shadow-lg ${
            t.type === 'success' ? 'bg-pitch' : 'bg-danger'
          }`}
        >
          <span>{t.message}</span>
          <button
            aria-label="Dismiss"
            className="opacity-70 hover:opacity-100"
            onClick={() => dismiss(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/** Skeleton block (§3.0: every data region gets one, no full-page spinners). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-card bg-pitch/10 ${className}`} />;
}
