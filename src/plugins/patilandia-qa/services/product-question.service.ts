import { Injectable, Inject } from '@nestjs/common';
import { ID, PaginatedList } from '@vendure/common/lib/shared-types';
import {
    ListQueryBuilder,
    ListQueryOptions,
    Product,
    RelationPaths,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';

import { ProductQuestion } from '../entities/product-question.entity';
import { PATILANDIA_QA_PLUGIN_OPTIONS } from '../constants';
import { PluginInitOptions } from '../types';

export interface SubmitProductQuestionInput {
    productId: ID;
    authorName: string;
    authorEmail: string;
    question: string;
}

/**
 * Same public trust level as patilandia-reviews — no login required, since asking a question is
 * exactly for someone who hasn't bought yet. No Patipuntos are ever tied to this (unlike reviews),
 * so there's no identity/purchase gate to enforce here — nothing to abuse for points.
 */
@Injectable()
export class ProductQuestionService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        @Inject(PATILANDIA_QA_PLUGIN_OPTIONS) private options: PluginInitOptions,
    ) {}

    /** Shop API — only questions a moderator has answered, for a single product. */
    findApprovedForProduct(
        ctx: RequestContext,
        productId: ID,
        options?: ListQueryOptions<ProductQuestion>,
    ): Promise<PaginatedList<ProductQuestion>> {
        return this.listQueryBuilder
            .build(ProductQuestion, options, { relations: ['product'], ctx })
            .andWhere('productquestion.productId = :productId', { productId })
            .andWhere('productquestion.approved = :approved', { approved: true })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    /** Admin API — every question regardless of moderation status, for the moderation queue. */
    findAll(
        ctx: RequestContext,
        options?: ListQueryOptions<ProductQuestion>,
        relations?: RelationPaths<ProductQuestion>,
    ): Promise<PaginatedList<ProductQuestion>> {
        return this.listQueryBuilder
            .build(ProductQuestion, options, { relations: relations ?? ['product'], ctx })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    findOne(ctx: RequestContext, id: ID): Promise<ProductQuestion | null> {
        return this.connection
            .getRepository(ctx, ProductQuestion)
            .findOne({ where: { id }, relations: ['product'] });
    }

    /** Shop API — anyone asking about a product. Starts unapproved; a moderator answers or rejects. */
    async submit(ctx: RequestContext, input: SubmitProductQuestionInput): Promise<ProductQuestion> {
        if (!input.question.trim()) {
            throw new UserInputError('La pregunta no puede estar vacía');
        }

        const product = await this.connection.getEntityOrThrow(ctx, Product, input.productId, {
            channelId: ctx.channelId,
        });

        const question = new ProductQuestion({
            product,
            authorName: input.authorName.trim(),
            authorEmail: input.authorEmail.trim(),
            question: input.question.trim(),
            answer: null,
            answeredAt: null,
            approved: false,
        });
        return this.connection.getRepository(ctx, ProductQuestion).save(question);
    }

    /** Admin API — the combined "aprobar y responder" action: a question only goes public once it
     *  has a real answer attached, there's no separate bare-approve step. */
    async answer(ctx: RequestContext, id: ID, answer: string): Promise<ProductQuestion> {
        if (!answer.trim()) {
            throw new UserInputError('La respuesta no puede estar vacía');
        }
        const question = await this.connection.getEntityOrThrow(ctx, ProductQuestion, id, {
            relations: ['product'],
        });
        question.answer = answer.trim();
        question.answeredAt = new Date();
        question.approved = true;
        return this.connection.getRepository(ctx, ProductQuestion).save(question);
    }

    /** Admin API — pull a published question back down (spam, indebida, ya no aplica). Keeps
     *  whatever answer it had, in case it's ever un-hidden later. */
    async hide(ctx: RequestContext, id: ID): Promise<ProductQuestion> {
        const question = await this.connection.getEntityOrThrow(ctx, ProductQuestion, id, {
            relations: ['product'],
        });
        question.approved = false;
        return this.connection.getRepository(ctx, ProductQuestion).save(question);
    }

    async delete(ctx: RequestContext, id: ID): Promise<void> {
        const question = await this.connection.getEntityOrThrow(ctx, ProductQuestion, id);
        await this.connection.getRepository(ctx, ProductQuestion).remove(question);
    }
}
