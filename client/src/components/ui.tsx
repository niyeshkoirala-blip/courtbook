import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react';
import { useToasts } from '../lib/toast';

/** Component library (§3.6) — Tailwind + cva, styled per design/00-system-sheet. */

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turf ' +
    'disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary:
          'cb-sheen bg-accent text-paper shadow-lg shadow-accent/25 hover:bg-accent-deep hover:shadow-accent/40',
        secondary: 'bg-turf/15 text-turf ring-1 ring-inset ring-turf/30 hover:bg-turf/25',
        danger: 'bg-danger text-paper hover:opacity-90',
        ghost: 'bg-transparent text-mint hover:bg-white/5 hover:text-turf',
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
  { label, error, hint, id, className, type, ...rest },
  ref,
) {
  const fieldId = id ?? `field-${label.replace(/\W+/g, '-').toLowerCase()}`;
  // Password fields get a reveal toggle: swap type to "text" while shown (§3.6 a11y).
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && reveal ? 'text' : type;
  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          type={inputType}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={`w-full rounded-lg border bg-white/5 px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-sage/60 ${
            error ? 'border-danger' : 'border-white/10 focus:border-turf/60'
          } ${isPassword ? 'pr-11' : ''} ${className ?? ''}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            aria-pressed={reveal}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-sage hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turf"
          >
            {reveal ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
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
    <div className="cb-glass flex flex-col items-center gap-3 rounded-card px-6 py-14 text-center">
      <span aria-hidden className="text-4xl">
        ⚽
      </span>
      <h3 className="font-display text-xl font-bold uppercase tracking-wide text-turf">{title}</h3>
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
          className={`flex items-start justify-between gap-3 rounded-card px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-md ${
            t.type === 'success'
              ? 'bg-pitch/90 text-mint ring-1 ring-turf/40'
              : 'bg-danger/90 text-white ring-1 ring-white/20'
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

/** Star rating — read-only display, or an input when `onChange` is given. */
export function Stars({
  value,
  onChange,
  className = 'text-base',
}: {
  value: number;
  onChange?: (n: number) => void;
  className?: string;
}) {
  const stars = [1, 2, 3, 4, 5];
  if (!onChange) {
    return (
      <span className={`inline-flex ${className}`} aria-label={`${value} out of 5 stars`}>
        {stars.map((n) => (
          <span
            key={n}
            aria-hidden
            className={n <= Math.round(value) ? 'text-accent' : 'text-white/20'}
          >
            ★
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className={`inline-flex ${className}`} role="radiogroup" aria-label="Rating">
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          className={`px-0.5 transition-transform hover:scale-125 ${
            n <= value ? 'text-accent' : 'text-white/25 hover:text-white/50'
          }`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

/** Skeleton block (§3.0: every data region gets one, no full-page spinners). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-card bg-white/6 ${className}`} />;
}
