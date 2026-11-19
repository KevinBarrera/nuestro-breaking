import type { PassClass, RequiredPassClass } from '@/events/pass-type-admin/pass-type-admin.types';
import {
  FULL_INCLUDES_GENERAL_MESSAGE,
  combinesGeneralWithFull,
} from '@/events/registration-entitlements/pass-class-rules';
import { passOnSale } from '@/events/sales';
import type { PublicRegistrationRuleCode } from './public-registration.types';

/** What the pass rules need to know about one pass type of the event. */
export type CatalogPassType = {
  passClass: PassClass;
  requiresPassClass: RequiredPassClass | null;
  priceCents: number;
  status: string;
  onlineSalesClosesAt: Date | null;
};

export type RuleViolation = { code: PublicRegistrationRuleCode; message: string; path: string };

/**
 * Catalog rules for the requested pass set, in request order. `passTypes` holds the event's pass
 * types by id, so an id from another event is simply missing. Returns the first violation or null.
 * Same rules as admin assignment: active pass types only, no general entry with a full pass (D1),
 * and an add-on such as Open Styles needs its required class in the same request. Online only: a
 * pass whose own sales close time has been reached at `now` is refused (#240), and a $0 pass type
 * is unavailable, the same as a missing one, because free passes are granted in person only (#263).
 */
export function passRuleViolation(
  passTypeIds: readonly string[],
  passTypes: ReadonlyMap<string, CatalogPassType>,
  now: Date,
): RuleViolation | null {
  const requested: CatalogPassType[] = [];
  for (const [index, id] of passTypeIds.entries()) {
    const passType = passTypes.get(id);
    if (!passType || passType.status !== 'active' || passType.priceCents <= 0)
      return {
        code: 'pass_type_unavailable',
        message: 'Pass type is not available',
        path: `passes[${index}].passTypeId`,
      };
    if (!passOnSale(passType.onlineSalesClosesAt, now))
      return {
        code: 'pass_type_sales_closed',
        message: 'Online sales of this pass are closed',
        path: `passes[${index}].passTypeId`,
      };
    requested.push(passType);
  }
  const classes = requested.map((passType) => passType.passClass);
  if (combinesGeneralWithFull(classes))
    return { code: 'general_with_full', message: FULL_INCLUDES_GENERAL_MESSAGE, path: 'passes' };
  for (const [index, passType] of requested.entries()) {
    const required = passType.requiresPassClass;
    if (required && !classes.includes(required))
      return {
        code: 'required_pass_missing',
        message: `Add-on requires a ${required} pass`,
        path: `passes[${index}].passTypeId`,
      };
  }
  return null;
}
