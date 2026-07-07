import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
  type UserDto,
} from '@courtbook/shared';
import { post, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';
import { Button, Field, Spinner } from '../components/ui';

/** Auth pages (§3.5, §6.3) — forms validated by the SAME schemas as the API. */

type SessionPayload = { accessToken: string; user: UserDto };

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-card bg-white p-8 shadow-sm">
        <h1 className="mb-6 font-display text-2xl uppercase tracking-wide text-pitch">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useAuth((s) => s.setSession);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(input: LoginInput) {
    try {
      const data = await post<SessionPayload>('/auth/login', input);
      setSession(data.user, data.accessToken);
      navigate(decodeURIComponent(params.get('next') ?? '/venues'));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_UNVERIFIED') {
        setUnverifiedEmail(input.email);
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Login failed — try again');
      }
    }
  }

  if (unverifiedEmail) return <ResendPanel email={unverifiedEmail} />;

  return (
    <AuthCard title="Log in">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isSubmitting} className="w-full">
          Log in
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link className="text-pitch underline" to="/auth/forgot">
          Forgot password?
        </Link>
        <Link className="text-pitch underline" to="/auth/register">
          Create account
        </Link>
      </div>
    </AuthCard>
  );
}

/** Post-register / unverified-login interstitial with 60s resend cooldown (§6.3). */
function ResendPanel({ email }: { email: string }) {
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function resend() {
    await post('/auth/resend-verification', { email });
    toast.success('Verification email sent');
    setCooldown(60);
  }

  return (
    <AuthCard title="Check your email">
      <p className="text-sm text-sage">
        We sent a verification link to <strong className="text-ink">{email}</strong>. Click it to
        activate your account — the link works for 24 hours.
      </p>
      <Button variant="secondary" className="mt-6 w-full" disabled={cooldown > 0} onClick={resend}>
        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
      </Button>
    </AuthCard>
  );
}

export function RegisterPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(input: RegisterInput) {
    try {
      await post('/auth/register', { ...input, phone: input.phone || undefined });
      setSentTo(input.email);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Registration failed');
    }
  }

  if (sentTo) return <ResendPanel email={sentTo} />;

  return (
    <AuthCard title="Create account">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field
          label="Name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Field
          label="Phone (optional)"
          inputMode="numeric"
          placeholder="98XXXXXXXX"
          error={errors.phone?.message}
          {...register('phone', { setValueAs: (v: string) => (v === '' ? undefined : v) })}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isSubmitting} className="w-full">
          Sign up
        </Button>
      </form>
      <p className="mt-4 text-sm">
        Already have an account?{' '}
        <Link className="text-pitch underline" to="/auth/login">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}

/** Landing target of the emailed link: /auth/verify?token=… → auto-login (§6.3). */
export function VerifyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return; // StrictMode double-mount — token is single-use
    fired.current = true;
    post<SessionPayload>('/auth/verify-email', { token: params.get('token') ?? '' })
      .then((data) => {
        setSession(data.user, data.accessToken);
        toast.success('Email verified — welcome to CourtBook!');
        navigate('/venues');
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Verification failed'),
      );
  }, [params, navigate, setSession]);

  return (
    <AuthCard title="Verifying…">
      {error ? (
        <>
          <p className="text-sm text-danger">{error}</p>
          <Link to="/auth/login" className="mt-4 block text-sm text-pitch underline">
            Back to login
          </Link>
        </>
      ) : (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
    </AuthCard>
  );
}

export function ForgotPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>();

  async function onSubmit({ email }: { email: string }) {
    await post('/auth/forgot-password', { email });
    setSent(true); // uniform response — never reveals account existence (§8)
  }

  return (
    <AuthCard title="Reset password">
      {sent ? (
        <p className="text-sm text-sage">
          If that email has an account, a reset link is on its way. It works once, for 30 minutes.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email', { required: 'Email is required' })}
          />
          <Button type="submit" loading={isSubmitting} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ password: string }>();

  async function onSubmit({ password }: { password: string }) {
    try {
      await post('/auth/reset-password', { token: params.get('token') ?? '', password });
      toast.success('Password updated — log in with your new password');
      navigate('/auth/login');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Reset failed');
    }
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          error={errors.password?.message}
          {...register('password', {
            required: true,
            minLength: { value: 8, message: 'At least 8 characters' },
          })}
        />
        <Button type="submit" loading={isSubmitting} className="w-full">
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
