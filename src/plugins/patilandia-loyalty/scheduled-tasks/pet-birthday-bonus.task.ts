import { ScheduledTask, TransactionalConnection } from '@vendure/core';

import { PetProfile } from '../../patilandia-pets/entities/pet-profile.entity';
import { LoyaltyService } from '../services/loyalty.service';

/** Daily job — awards PET_BIRTHDAY to any pet whose birthDate month/day matches today. The
 *  idempotency key includes the year, so the same pet can earn this bonus again next year without
 *  colliding with this year's award. Pets without a birthDate (optional field) never match. */
export const petBirthdayBonusTask = new ScheduledTask({
    id: 'patipuntos-pet-birthday-bonus',
    description: "Otorga el bono de cumpleaños de Patipuntos a las mascotas que cumplen años hoy",
    schedule: cron => cron.everyDayAt(5, 0),
    execute: async ({ injector, scheduledContext }) => {
        const connection = injector.get(TransactionalConnection);
        const loyaltyService = injector.get(LoyaltyService);

        const pets = await connection.getRepository(scheduledContext, PetProfile).find({ relations: ['customer'] });
        const today = new Date();
        const month = today.getMonth();
        const day = today.getDate();
        const year = today.getFullYear();

        let awarded = 0;
        for (const pet of pets) {
            if (!pet.birthDate) continue;
            const birthDate = new Date(pet.birthDate);
            if (birthDate.getMonth() !== month || birthDate.getDate() !== day) continue;

            const result = await loyaltyService.award(scheduledContext, {
                ruleCode: 'PET_BIRTHDAY',
                customerEmail: pet.customer.emailAddress,
                referenceType: 'PetProfile',
                referenceId: String(pet.id),
                idempotencyKey: `earn:pet:${pet.id}:PET_BIRTHDAY:${year}`,
            });
            if (result) awarded++;
        }
        return { checked: pets.length, awarded };
    },
});
