import type { PassClass, RequiredPassClass } from '@/events/pass-type-admin/pass-type-admin.types';
import {
  FULL_INCLUDES_GENERAL_MESSAGE,
  combinesGeneralWithFull,
} from '@/events/registration-entitlements/pass-class-rules';
import type { PublicRegistrationRuleCode } from './public-registration.types';

/** What the pass rules need to know about one pass type of the event. */
export type CatalogPassType = {
  passClass: PassClass;
  requiresPassClass: RequiredPassClass | null;
  status: string;
};

export type RuleViolation = { code: PublicRegistrationRuleCode; message: string; path: string };

/**
 * Catalog rules for the requested pass set, in request order. `passTypes` holds the event's pass
 * types by id, so an id from another event is simply missing. Returns the first violation or null.
 * Same rules as admin assignment: active pass types only, no general entry with a full pass (D1),
 * and an add-on such as Open Styles needs its required class in the same request.
 */
export function passRuleViolation(
  passTypeIds: readonly string[],
  passTypes: ReadonlyMap<string, CatalogPassType>,
): RuleViolation | null {
  const requested: CatalogPassType[] = [];
  for (const [index, id] of passTypeIds.entries()) {
    const passType = passTypes.get(id);
    if (!passType || passType.status !== 'active')
      return {
        code: 'pass_type_unavailable',
        message: 'Pass type is not available',
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
