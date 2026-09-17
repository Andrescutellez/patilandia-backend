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
    /** Only used for a guest (no session) caller — ignored when a real customer session exists. */
    customerEmail?: string;
    customerFirstName?: string;
    customerLastName?: string;
    name: string;
    species: string;
    breed?: string;
    ownerName?: string;
    birthDate?: string;
    sizeLabel?: string;
    notes?: string;
}

export interface UpdatePetProfileInput {
    id: ID;
    /** Only used for a guest (no session) caller — ignored when a real customer session exists. */
    customerEmail?: string;
    name?: string;
    species?: string;
    breed?: string;
    ownerName?: string;
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
     * Shop API — "my pets". Backed by a real Vendure session when the caller is logged in
     * (`ctx.activeUserId`); falls back to trusting a client-supplied email only for a guest with no
     * registered account (see resolveRequestingCustomer). Documented as a known limitation for
     * guests in Decisiones y Razonamiento — a registered customer no longer has this exposure.
     */
    async findForCustomerEmail(ctx: RequestContext, email?: string | null): Promise<PetProfile[]> {
        const customer = await this.resolveRequestingCustomer(ctx, email);
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

        const customer = await this.resolveOrCreateRequestingCustomer(ctx, input.customerEmail, {
            firstName: input.customerFirstName,
            lastName: input.customerLastName,
        });

        const pet = new PetProfile({
            customer,
            name: input.name.trim(),
            species: input.species,
            breed: input.breed?.trim() ?? '',
            ownerName: input.ownerName?.trim() ?? '',
            birthDate: input.birthDate ? new Date(input.birthDate) : null,
            sizeLabel: input.sizeLabel ?? '',
            notes: input.notes?.trim() ?? '',
        });
        const saved = await this.connection.getRepository(ctx, PetProfile).save(pet);
        await this.eventBus.publish(new PetProfileCreatedEvent(ctx, saved));
        return saved;
    }

    async update(ctx: RequestContext, input: UpdatePetProfileInput): Promise<PetProfile> {
        const customer = await this.resolveRequestingCustomer(ctx, input.customerEmail);
        if (!customer) {
            throw new UserInputError('Perfil de mascota no encontrado');
        }
        const pet = await this.getOwnedPetProfile(ctx, input.id, customer.id);

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
        if (input.ownerName !== undefined) {
            pet.ownerName = input.ownerName.trim();
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

    async delete(ctx: RequestContext, id: ID, customerEmail?: string | null): Promise<void> {
        const customer = await this.resolveRequestingCustomer(ctx, customerEmail);
        if (!customer) {
            throw new UserInputError('Perfil de mascota no encontrado');
        }
        const pet = await this.getOwnedPetProfile(ctx, id, customer.id);
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

    private async getOwnedPetProfile(ctx: RequestContext, id: ID, customerId: ID): Promise<PetProfile> {
        const pet = await this.connection.getEntityOrThrow(ctx, PetProfile, id, { relations: ['customer'] });
        if (pet.customer.id !== customerId) {
            throw new UserInputError('Perfil de mascota no encontrado');
        }
        return pet;
    }

    /**
     * Query-side identity resolution: a real logged-in session always wins over a client-supplied
     * email. For an anonymous caller, the email is trusted only if it does NOT already belong to a
     * registered account (`customer.user` is eager-loaded on Customer, so this is free to check) —
     * once someone has a password, typing their email is no longer sufficient proof of identity.
     * Returns null for both "no such customer" and "that email is registered, log in" — deliberately
     * indistinguishable, so this can't be used to enumerate which emails have accounts.
     */
    private async resolveRequestingCustomer(ctx: RequestContext, clientEmail?: string | null): Promise<Customer | null> {
        if (ctx.activeUserId) {
            return (await this.customerService.findOneByUserId(ctx, ctx.activeUserId)) ?? null;
        }
        if (!clientEmail) return null;
        const customer = await this.findCustomerByEmail(ctx, clientEmail);
        if (customer?.user) return null;
        return customer;
    }

    /** Mutation-side counterpart — may create a brand-new guest Customer, so it throws (rather than
     *  returning null) when identity can't be resolved, since a mutation deserves a clear "log in"
     *  error instead of a silent no-op. */
    private async resolveOrCreateRequestingCustomer(
        ctx: RequestContext,
        clientEmail?: string | null,
        nameHints?: { firstName?: string; lastName?: string },
    ): Promise<Customer> {
        if (ctx.activeUserId) {
            const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
            if (!customer) {
                throw new UserInputError('No se encontró un cliente asociado a esta sesión');
            }
            return customer;
        }
        if (!clientEmail) {
            throw new UserInputError('Se requiere iniciar sesión o indicar un correo');
        }
        const existing = await this.findCustomerByEmail(ctx, clientEmail);
        if (existing?.user) {
            throw new UserInputError('Ya existe una cuenta con este correo — iniciá sesión para continuar');
        }
        const customer = await this.customerService.createOrUpdate(ctx, {
            emailAddress: clientEmail,
            firstName: nameHints?.firstName?.trim() || clientEmail.split('@')[0] || 'Cliente',
            lastName: nameHints?.lastName?.trim() ?? '',
        });
        if (isGraphQlErrorResult(customer)) {
            throw new UserInputError(customer.message);
        }
        return customer;
    }
}
