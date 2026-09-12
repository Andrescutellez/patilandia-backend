import { RequestContext, VendureEvent } from '@vendure/core';

import { PetProfile } from '../entities/pet-profile.entity';

/** Published once per new PetProfile — patilandia-loyalty subscribes to this to award the
 *  PET_REGISTERED bonus, without patilandia-pets needing to know loyalty exists. */
export class PetProfileCreatedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public petProfile: PetProfile,
    ) {
        super();
    }
}
