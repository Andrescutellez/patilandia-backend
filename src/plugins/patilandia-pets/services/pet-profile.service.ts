import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Customer,
    CustomerService,
    EventBus,
    RequestContext,
    TransactionalConnection,
    UserInputError,
    isGraphQlErrorResult,
} from '@vendure/core';

import { PetProfile } from '../entities/pet-profile.entity';
import { PetProfileCreatedEvent } from '../events/pet-profile-created-event';

const VALID_SPECIES = ['dog', 'cat', 'other'];

export interface CreatePetProfileInput {
    customerEmail: string;
    customerFirstName?: string;
    customerLastName?: string;
    name: string;
    species: string;
    breed?: string;
    birthDate?: string;
    sizeLabel?: string;
    notes?: string;
}

export interface UpdatePetProfileInput {
    id: ID;
    customerEmail: string;
    name?: string;
    species?: string;
    breed?: string;
    birthDate?: string;
    sizeLabel?: string;
    notes?: string;
}

function validateSpecies(species: string) {
    if (!VALID_SPECIES.includes(species)) {
        throw new UserInputError(`La especie debe ser una de: ${VALID_SPECIES.join(', ')}`);
    }
}

@Injectable()
export class PetProfileService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private eventBus: EventBus,
    ) {}

    /** Admin API — every pet profile, for support/context. No moderation concept here (unlike
     *  reviews), pet data is only ever entered by its own owner. */
    findAll(ctx: RequestContext): Promise<PetProfile[]> {
        return this.connection
            .getRepository(ctx, PetProfile)
            .find({ relations: ['customer'], order: { createdAt: 'DESC' } });
    }

    /**
     * Shop API — "my pets", identified by email only (no password, no login — matches the trust
     * level of the rest of the storefront, where auth is deferred entirely; see setCustomerEmail
     * in shop-client.ts for the same pattern already used by the cart). Not real security: anyone
     * who knows/guesses an email can read that customer's pets. Documented as a known limitation
     * in Decisiones y Razonamiento — upgrading this to real ownership is exactly what building
     * customer auth later would fix, with no changes needed here.
     */
    async findForCustomerEmail(ctx: RequestContext, email: string): Promise<PetProfile[]> {
        const customer = await this.findCustomerByEmail(ctx, email);
        if (!customer) {
            return [];
        }
        return this.connection.getRepository(ctx, PetProfile).find({
            where: { customer: { id: customer.id } },
            relations: ['customer'],
            order: { createdAt: 'ASC' },
        });
    }

    async create(ctx: RequestContext, input: CreatePetProfileInput): Promise<PetProfile> {
        if (!input.name.trim()) {
            throw new UserInputError('El nombre de la mascota es obligatorio');
        }
        validateSpecies(input.species);

        const customer = await this.customerService.createOrUpdate(ctx, {
            emailAddress: input.customerEmail,
            firstName: input.customerFirstName?.trim() || input.customerEmail.split('@')[0] || 'Cliente',
            lastName: input.customerLastName?.trim() ?? '',
        });
        if (isGraphQlErrorResult(customer)) {
            throw new UserInputError(customer.message);
        }

        const pet = new PetProfile({
            customer,
            name: input.name.trim(),
            species: input.species,
            breed: input.breed?.trim() ?? '',
            birthDate: input.birthDate ? new Date(input.birthDate) : null,
            sizeLabel: input.sizeLabel ?? '',
            notes: input.notes?.trim() ?? '',
        });
        const saved = await this.connection.getRepository(ctx, PetProfile).save(pet);
        await this.eventBus.publish(new PetProfileCreatedEvent(ctx, saved));
        return saved;
    }

    async update(ctx: RequestContext, input: UpdatePetProfileInput): Promise<PetProfile> {
        const pet = await this.getOwnedPetProfile(ctx, input.id, input.customerEmail);

        if (input.name !== undefined) {
            if (!input.name.trim()) {
                throw new UserInputError('El nombre de la mascota es obligatorio');
            }
            pet.name = input.name.trim();
        }
        if (input.species !== undefined) {
            validateSpecies(input.species);
            pet.species = input.species;
        }
        if (input.breed !== undefined) {
            pet.breed = input.breed.trim();
        }
        if (input.birthDate !== undefined) {
            pet.birthDate = input.birthDate ? new Date(input.birthDate) : null;
        }
        if (input.sizeLabel !== undefined) {
            pet.sizeLabel = input.sizeLabel;
        }
        if (input.notes !== undefined) {
            pet.notes = input.notes.trim();
        }

        return this.connection.getRepository(ctx, PetProfile).save(pet);
    }

    async delete(ctx: RequestContext, id: ID, customerEmail: string): Promise<void> {
        const pet = await this.getOwnedPetProfile(ctx, id, customerEmail);
        await this.connection.getRepository(ctx, PetProfile).remove(pet);
    }

    /** Admin-only cleanup — no ownership check, gated by Permission.DeleteCustomer instead. */
    async adminDelete(ctx: RequestContext, id: ID): Promise<void> {
        const pet = await this.connection.getEntityOrThrow(ctx, PetProfile, id);
        await this.connection.getRepository(ctx, PetProfile).remove(pet);
    }

    private findCustomerByEmail(ctx: RequestContext, email: string): Promise<Customer | null> {
        return this.connection.getRepository(ctx, Customer).findOne({ where: { emailAddress: email } });
    }

    private async getOwnedPetProfile(ctx: RequestContext, id: ID, customerEmail: string): Promise<PetProfile> {
        const pet = await this.connection.getEntityOrThrow(ctx, PetProfile, id, { relations: ['customer'] });
        if (pet.customer.emailAddress !== customerEmail) {
            throw new UserInputError('Perfil de mascota no encontrado');
        }
        return pet;
    }
}
