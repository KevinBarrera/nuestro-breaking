import { ACTIVITY_KINDS, type ActivityKind } from '@/database/schema';

export { ACTIVITY_KINDS, type ActivityKind };

// Membership in the closed kind list (#249); the caller trims first, so ' workshop ' still passes.
export function isActivityKind(value: unknown): value is ActivityKind {
  return (ACTIVITY_KINDS as readonly unknown[]).includes(value);
}
