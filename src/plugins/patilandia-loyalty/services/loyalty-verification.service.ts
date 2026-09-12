import { Injectable } from '@nestjs/common';
import { EventBus, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { createHash, randomBytes } from 'crypto';

import { LOYALTY_VERIFICATION_RESEND_COOLDOWN_SECONDS, LOYALTY_VERIFICATION_TOKEN_TTL_MINUTES } from '../constants';
import { LoyaltyAccount } from '../entities/loyalty-account.entity';
import { LoyaltyVerificationToken } from '../entities/loyalty-verification-token.entity';
import { LoyaltyEmailVerificationRequestedEvent } from '../events/loyalty-email-verification-requested-event';

import { LoyaltyService } from './loyalty.service';

function generateRawToken(): string {
    return randomBytes(32).toString('hex');
}

function hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * patilandia-loyalty's own magic-link email verification — proof of inbox ownership without a
 * password or login, matching the no-real-auth trust level everywhere else in this storefront.
 * Deliberately NOT Vendure's native customer verification (registerCustomerAccount /
 * verifyCustomerAccount), which requires creating a real password-based User — exactly the
 * customer authentication this project has decided to defer project-wide.
 */
@Injectable()
export class LoyaltyVerificationService {
    constructor(
        private connection: TransactionalConnection,
        private loyaltyService: LoyaltyService,
        private eventBus: EventBus,
    ) {}

    async requestVerification(ctx: RequestContext, email: string): Promise<void> {
        const account = await this.loyaltyService.getOrCreateAccount(ctx, email);
        if (account.emailVerifiedAt) {
            return;
        }

        const tokenRepo = this.connection.getRepository(ctx, LoyaltyVerificationToken);
        const [mostRecent] = await tokenRepo.find({
            where: { account: { id: account.id } },
            order: { createdAt: 'DESC' },
            take: 1,
        });
        if (mostRecent) {
            const secondsSinceRequested = (Date.now() - mostRecent.createdAt.getTime()) / 1000;
            if (secondsSinceRequested < LOYALTY_VERIFICATION_RESEND_COOLDOWN_SECONDS) {
                throw new UserInputError('Ya te enviamos un correo hace un momento — revisá tu bandeja antes de pedir otro.');
            }
        }

        const rawToken = generateRawToken();
        await tokenRepo.save(
            new LoyaltyVerificationToken({
                account,
                tokenHash: hashToken(rawToken),
                expiresAt: new Date(Date.now() + LOYALTY_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000),
                consumedAt: null,
            }),
        );

        await this.eventBus.publish(new LoyaltyEmailVerificationRequestedEvent(ctx, email, rawToken));
    }

    async confirmVerification(ctx: RequestContext, rawToken: string): Promise<boolean> {
        const tokenRepo = this.connection.getRepository(ctx, LoyaltyVerificationToken);
        const tokenEntity = await tokenRepo.findOne({
            where: { tokenHash: hashToken(rawToken) },
            relations: ['account'],
        });
        if (!tokenEntity || tokenEntity.consumedAt || tokenEntity.expiresAt.getTime() < Date.now()) {
            throw new UserInputError('El enlace de verificación no es válido o ya venció — pedí uno nuevo.');
        }

        tokenEntity.consumedAt = new Date();
        await tokenRepo.save(tokenEntity);

        if (!tokenEntity.account.emailVerifiedAt) {
            tokenEntity.account.emailVerifiedAt = new Date();
            await this.connection.getRepository(ctx, LoyaltyAccount).save(tokenEntity.account);
        }
        return true;
    }
}
