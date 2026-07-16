import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { LoginInput, RegisterInput, UserDto } from '@courtbook/shared';
import { AppError } from '../../core/errors.js';
import { config } from '../../core/config.js';
import { User, toUserDto, type UserDoc } from '../users/user.model.js';
import { Session } from './session.model.js';
import { queueEmail } from '../notifications/outbox.js';

/** Lifetimes & limits (blueprint §2.7, §6.3, §8). */
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const RESET_TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 min

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface AuthResult {
  user: UserDto;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

// Compared against when the email doesn't exist — login cost is identical
// for unknown-email vs wrong-password (enumeration defense, §8).
const DUMMY_HASH = bcrypt.hashSync('placeholder-password', config.bcryptRounds);

/** Refresh/verify/reset tokens are stored only as HMACs — DB leak ≠ usable tokens. */
function hashToken(raw: string): string {
  return createHmac('sha256', config.refreshSecret).update(raw).digest('hex');
}

function signAccessToken(user: UserDoc): string {
  return jwt.sign({ sub: user.id as string, role: user.role }, config.jwtSecret, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

/** Creates a session doc and returns the full login payload. */
async function issueSession(
  user: UserDoc,
  meta: SessionMeta,
  familyId: string = randomUUID(),
): Promise<AuthResult> {
  const refreshToken = randomBytes(32).toString('hex');
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await Session.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    familyId,
    expiresAt: refreshExpiresAt,
    ...(meta.ip && { ip: meta.ip }),
    ...(meta.userAgent && { userAgent: meta.userAgent }),
  });
  return {
    user: toUserDto(user),
    accessToken: signAccessToken(user),
    refreshToken,
    refreshExpiresAt,
  };
}

export async function register(input: RegisterInput): Promise<UserDto> {
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  const isOwner = input.accountType === 'owner';
  const rawVerifyToken = randomBytes(32).toString('hex');
  // Owner applicants are gated by admin approval, not email — so they carry an
  // `ownerRequest` flag and get no verify token. Players get the email path.
  const gateFields = isOwner
    ? { ownerRequest: 'pending' as const }
    : {
        verifyTokenHash: hashToken(rawVerifyToken),
        verifyTokenExpires: new Date(Date.now() + VERIFY_TTL_MS),
      };
  try {
    const user = await User.create({
      name: input.name,
      email: input.email,
      ...(input.phone && { phone: input.phone }),
      passwordHash,
      ...gateFields,
    });
    if (!isOwner) {
      await queueEmail(user.email, 'verify_email', {
        name: user.name,
        link: `${config.corsOrigins[0]}/auth/verify?token=${rawVerifyToken}`,
      });
    }
    return toUserDto(user);
  } catch (err) {
    // unique index on email is the arbiter — no check-then-insert race
    if (err instanceof Error && 'code' in err && err.code === 11000) {
      // An UNVERIFIED account proves no ownership of the email, so let the
      // signup be retried: reset its credentials + resend the link. A VERIFIED
      // account (or a REJECTED owner applicant) is a real claim on the email —
      // that still blocks with 409.
      const existing = await User.findOne({ email: input.email.toLowerCase(), deletedAt: null });
      if (existing && !existing.emailVerifiedAt && existing.ownerRequest !== 'rejected') {
        existing.name = input.name;
        existing.passwordHash = passwordHash;
        if (input.phone) existing.phone = input.phone;
        existing.role = 'player';
        if (isOwner) {
          existing.ownerRequest = 'pending';
          existing.verifyTokenHash = null;
          existing.verifyTokenExpires = null;
        } else {
          existing.ownerRequest = null;
          existing.verifyTokenHash = hashToken(rawVerifyToken);
          existing.verifyTokenExpires = new Date(Date.now() + VERIFY_TTL_MS);
        }
        await existing.save();
        if (!isOwner) {
          await queueEmail(existing.email, 'verify_email', {
            name: existing.name,
            link: `${config.corsOrigins[0]}/auth/verify?token=${rawVerifyToken}`,
          });
        }
        return toUserDto(existing);
      }
      throw new AppError('EMAIL_EXISTS', 409, 'An account with this email already exists');
    }
    throw err;
  }
}

/** §6.3: clicking the emailed link verifies AND logs the user in. */
export async function verifyEmail(rawToken: string, meta: SessionMeta): Promise<AuthResult> {
  const user = await User.findOne({
    verifyTokenHash: hashToken(rawToken),
    verifyTokenExpires: { $gt: new Date() },
  });
  if (!user) throw new AppError('TOKEN_INVALID', 400, 'Verification link is invalid or expired');
  user.emailVerifiedAt = new Date();
  user.verifyTokenHash = null;
  user.verifyTokenExpires = null;
  await user.save();
  return issueSession(user, meta);
}

export async function resendVerification(email: string): Promise<void> {
  // Always resolves — response never reveals whether the account exists (§8)
  const user = await User.findOne({ email, deletedAt: null, emailVerifiedAt: null });
  if (!user) return;
  const rawToken = randomBytes(32).toString('hex');
  user.verifyTokenHash = hashToken(rawToken);
  user.verifyTokenExpires = new Date(Date.now() + VERIFY_TTL_MS);
  await user.save();
  await queueEmail(user.email, 'verify_email', {
    name: user.name,
    link: `${config.corsOrigins[0]}/auth/verify?token=${rawToken}`,
  });
}

export async function login(input: LoginInput, meta: SessionMeta): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email.toLowerCase(), deletedAt: null }).select(
    '+passwordHash',
  );

  if (!user) {
    await bcrypt.compare(input.password, DUMMY_HASH); // burn the same time
    throw new AppError('INVALID_CREDENTIALS', 401, 'Incorrect email or password');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError('ACCOUNT_LOCKED', 423, 'Too many failed attempts — try again in 15 minutes');
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) {
    user.failedLogins += 1;
    if (user.failedLogins >= MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + LOCK_MS);
      user.failedLogins = 0;
    }
    await user.save();
    // identical message to the unknown-email branch (§8)
    throw new AppError('INVALID_CREDENTIALS', 401, 'Incorrect email or password');
  }

  // Owner-approval gate — only revealed after a correct password (no enumeration).
  if (user.ownerRequest === 'pending') {
    throw new AppError('OWNER_PENDING', 403, 'Your owner account is awaiting admin approval');
  }
  if (user.ownerRequest === 'rejected') {
    throw new AppError('OWNER_REJECTED', 403, 'Your owner application was not approved');
  }

  if (!user.emailVerifiedAt) {
    throw new AppError('EMAIL_UNVERIFIED', 403, 'Verify your email before logging in');
  }

  if (user.failedLogins > 0 || user.lockedUntil) {
    user.failedLogins = 0;
    user.lockedUntil = null;
    await user.save();
  }
  return issueSession(user, meta);
}

/**
 * Refresh rotation with reuse detection (§2.7). The atomic findOneAndUpdate
 * is the one-time-use guarantee: whoever loses the race gets null. A hit on
 * an already-revoked token means theft or replay → revoke the whole family.
 */
export async function rotateRefresh(rawToken: string, meta: SessionMeta): Promise<AuthResult> {
  const tokenHash = hashToken(rawToken);
  const session = await Session.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } },
    { revokedAt: new Date() },
  );

  if (!session) {
    const reused = await Session.findOne({ tokenHash });
    if (reused) {
      await Session.updateMany(
        { familyId: reused.familyId, revokedAt: null },
        { revokedAt: new Date() },
      );
    }
    throw new AppError('REFRESH_INVALID', 401, 'Session expired — please log in again');
  }

  const user = await User.findOne({ _id: session.userId, deletedAt: null });
  if (!user) throw new AppError('REFRESH_INVALID', 401, 'Session expired — please log in again');
  return issueSession(user, meta, session.familyId);
}

/** Revokes the device's whole session family (§4.4 logout). */
export async function logout(rawToken: string): Promise<void> {
  const session = await Session.findOne({ tokenHash: hashToken(rawToken) });
  if (session) {
    await Session.updateMany(
      { familyId: session.familyId, revokedAt: null },
      { revokedAt: new Date() },
    );
  }
}

/** Uniform 200 regardless of account existence (§6.3, §8). */
export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email, deletedAt: null });
  if (!user) return;
  const rawToken = randomBytes(32).toString('hex');
  user.resetTokenHash = hashToken(rawToken);
  user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MS);
  await user.save();
  await queueEmail(user.email, 'password_reset', {
    name: user.name,
    link: `${config.corsOrigins[0]}/auth/reset?token=${rawToken}`,
  });
}

/** Single-use reset; revokes every session on success + confirmation email (§6.3). */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const user = await User.findOne({
    resetTokenHash: hashToken(rawToken),
    resetTokenExpires: { $gt: new Date() },
  });
  if (!user) throw new AppError('TOKEN_INVALID', 400, 'Reset link is invalid or expired');

  user.passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
  user.resetTokenHash = null;
  user.resetTokenExpires = null;
  user.failedLogins = 0;
  user.lockedUntil = null;
  await user.save();

  await Session.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  await queueEmail(user.email, 'password_changed', { name: user.name });
}
