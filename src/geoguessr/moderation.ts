import type { UserModerationStatus } from './types';
export function moderationState(user: UserModerationStatus, now = Date.now()) {
  const expiry = typeof user.suspendedUntil === 'string' ? Date.parse(user.suspendedUntil) : NaN;
  let suspension = 'unknown';
  if (Number.isFinite(expiry)) suspension = expiry > now ? 'active' : 'past';
  else if (user.suspendedUntil === null) suspension = 'none';
  const banned = user.isBanned === true;
  return { banned, suspension, expiry };
}
