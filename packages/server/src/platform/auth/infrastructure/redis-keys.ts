/** Centralized Redis key naming so TTL/format changes happen in one place. */
export const RedisKeys = {
  lockoutFailures: (identifier: string): string => `auth:lockout:fails:${identifier}`,
  lockoutLocked: (identifier: string): string => `auth:lockout:locked:${identifier}`,
  preauthToken: (token: string): string => `auth:preauth:${token}`,
  totpReplayGuard: (userId: string, code: string, period: number): string =>
    `auth:2fa:used:${userId}:${period}:${code}`,
  otpCode: (phone: string): string => `auth:otp:code:${phone}`,
  otpSendCountPhone: (phone: string): string => `auth:otp:sendcount:phone:${phone}`,
  otpSendCountIp: (ip: string): string => `auth:otp:sendcount:ip:${ip}`,
  passwordResetToken: (tokenHash: string): string => `auth:pwreset:${tokenHash}`,
  apiKeyCache: (keyHash: string): string => `auth:apikey:${keyHash}`,
  sessionRevoked: (sessionId: string): string => `auth:session:revoked:${sessionId}`,
  permsCache: (permsHash: string): string => `auth:perms:${permsHash}`,
} as const;
