export { expireDueRegistrations } from './expire-registrations';
export type { ExpiryOptions, ExpiryScope } from './expire-registrations';
export {
  EXPIRY_SWEEP_INTERVAL_MS,
  PendingRegistrationExpirySweeper,
  readExpirySweepInterval,
} from './pending-registration-expiry-sweeper';
