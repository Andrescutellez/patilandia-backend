import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { LoyaltyAccount } from '../entities/loyalty-account.entity';

export interface EligibilityCheck {
    code: string;
    label: string;
    passed: boolean;
}

export interface EligibilityResult {
    eligible: boolean;
    checks: EligibilityCheck[];
    failedChecks: string[];
}

/**
 * Redemption eligibility, as a list of named checks rather than one rigid `if`. Today: a verified
 * email (patilandia-loyalty's own magic-link flow, not Vendure's native — see
 * LoyaltyVerificationToken) and at least one completed purchase — both explicit, user-requested
 * trust signals, chosen over an arbitrary account-age rule. Adding a future check (account age,
 * purchase history depth, an activity rate-limit, a manual trust/block flag) means appending one
 * more entry to `runChecks`, not touching the checks already here or any of their call sites.
 */
@Injectable()
export class LoyaltyEligibilityService {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async check(ctx: RequestContext, account: LoyaltyAccount): Promise<EligibilityResult> {
        const checks = this.runChecks(account);
        const failedChecks = checks.filter(c => !c.passed).map(c => c.label);
        return { eligible: failedChecks.length === 0, checks, failedChecks };
    }

    private runChecks(account: LoyaltyAccount): EligibilityCheck[] {
        return [
            {
                code: 'emailVerified',
                label: 'Verificá tu correo',
                passed: account.emailVerifiedAt !== null,
            },
            {
                code: 'hasCompletedPurchase',
                label: 'Hacé tu primera compra',
                passed: account.completedOrderCount >= 1,
            },
        ];
    }
}
