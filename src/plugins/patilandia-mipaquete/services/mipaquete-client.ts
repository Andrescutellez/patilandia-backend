import { Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';
import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';

import { loggerCtx, MIPAQUETE_CATALOG_CACHE_TTL_MS } from '../constants';

// Dev-mode-only default — the base URL is a public endpoint, not a secret (see
// mipaquete-api-v2.md section 2), same "safe to default in dev, must be set explicitly in
// production" convention already used for STOREFRONT_URL in ../../vendure-config.ts. The API key
// and webhook secret below are real credentials and have NO such fallback.
const DEV_DEFAULT_BASE_URL = 'https://api-v2.dev.mpr.mipaquete.com';
const IS_DEV = process.env.APP_ENV === 'dev';

const mipaqueteBaseUrl = process.env.MIPAQUETE_BASE_URL ?? (IS_DEV ? DEV_DEFAULT_BASE_URL : undefined);
const mipaqueteApiKey = process.env.MIPAQUETE_API_KEY;
const mipaqueteUserId = process.env.MIPAQUETE_USER_ID;

if (!mipaqueteBaseUrl) {
    throw new Error('MIPAQUETE_BASE_URL debe estar configurada en producción');
}

export class MipaqueteNotConfiguredError extends Error {
    constructor() {
        super('Mi Paquete no está configurado — falta la variable de entorno MIPAQUETE_API_KEY');
        this.name = 'MipaqueteNotConfiguredError';
    }
}

export class MipaqueteApiError extends Error {
    status?: number;
    endpoint: string;

    constructor(message: string, endpoint: string, status?: number) {
        super(message);
        this.name = 'MipaqueteApiError';
        this.endpoint = endpoint;
        this.status = status;
    }
}

export interface MipaqueteLocation {
    _id: string;
    locationName: string;
    departmentOrStateName: string;
    locationCode: string;
    departmentOrStateCode: string;
    countryCode: string;
}

export interface MipaqueteDeliveryCompany {
    _id: string;
    name: string;
    image?: string;
}

export interface QuoteShippingInput {
    originLocationCode: string;
    destinyLocationCode: string;
    height: number;
    width: number;
    length: number;
    weight: number;
    quantity: number;
    declaredValue: number;
    saleValue?: number;
}

export interface QuoteShippingOption {
    id: string;
    deliveryCompanyName: string;
    deliveryCompanyImgUrl?: string;
    shippingCost: number;
    collectionCommissionWithRate?: number;
    collectionCommissionWithOutRate?: number;
    isMessengerService?: boolean;
    shippingTime: number;
    realWeightVolume?: number;
    officeAddress?: string;
    forwardingService?: boolean;
    singleOfficeDelivery?: boolean;
    pickupService?: boolean;
    pickupTime?: number;
    deliveryCompanyId: string;
    score?: number;
}

export interface CreateSendingInput {
    sender: {
        name: string;
        surname: string;
        cellPhone: string;
        prefix: string;
        email: string;
        pickupAddress: string;
        nit: string;
        nitType: string;
    };
    receiver: {
        name: string;
        surname: string;
        email: string;
        prefix: string;
        cellPhone: string;
        destinationAddress: string;
        nit?: string;
        nitType?: string;
    };
    productInformation: {
        quantity: number;
        width: number;
        large: number; // NOT "length" — mipaquete-api-v2.md section 4.2's documented quirk
        height: number;
        weight: number;
        forbiddenProduct: boolean;
        productReference: string;
        declaredValue: number;
    };
    locate: {
        originDaneCode: string;
        destinyDaneCode: string;
    };
    channel: string;
    deliveryCompany: string;
    description: string;
    comments?: string;
    paymentType: 101 | 102;
    valueCollection: number;
    requestPickup: boolean;
    adminTransactionData: { saleValue: number };
    user?: string;
}

export interface CreateSendingResult {
    mpCode: number;
    message: string;
}

export interface SendingTrackingEvent {
    updateState: string;
    date: string;
    description?: string;
}

export interface SendingTrackingResult {
    deliveryCompanyName: string;
    deliveryCompany: string;
    tracking: SendingTrackingEvent[];
    mpCode: number;
    origin: string;
    destiny: string;
}

/**
 * Full client for mipaquete.com's API v2, implemented exactly per mipaquete-api-v2.md — every
 * endpoint listed in that document's section 5, plus the quirks in section 4 (integers for
 * weight/dimensions, `large` not `length` in createSending, DANE codes kept as zero-padded strings,
 * getSendings' Spanish-keyed response left to the caller to map). Never called directly by
 * checkers/calculators/resolvers without going through MipaqueteService, which owns caching and
 * business rules — this class only knows how to talk to the real API.
 */
@Injectable()
export class MipaqueteClient {
    private readonly http: AxiosInstance;
    private locationsCache: { fetchedAt: number; data: MipaqueteLocation[] } | null = null;
    private deliveryCompaniesCache: { fetchedAt: number; data: MipaqueteDeliveryCompany[] } | null = null;

    constructor() {
        this.http = axios.create({
            baseURL: mipaqueteBaseUrl,
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' },
        });

        this.http.interceptors.request.use(config => {
            config.headers['session-tracker'] = config.headers['session-tracker'] || randomUUID();
            return config;
        });
    }

    /** Every real call goes through here first — a checker/calculator that finds Mi Paquete isn't
     *  configured must treat the order as ineligible, never invent a price (see plan). */
    private requireConfigured(): string {
        if (!mipaqueteApiKey) {
            throw new MipaqueteNotConfiguredError();
        }
        return mipaqueteApiKey;
    }

    private async request<T>(
        method: 'get' | 'post' | 'put' | 'delete',
        url: string,
        options: { params?: Record<string, unknown>; data?: unknown; skipAuth?: boolean } = {},
    ): Promise<T> {
        const headers: Record<string, string> = {};
        if (!options.skipAuth) {
            headers.apikey = this.requireConfigured();
        }
        try {
            const response = await this.http.request<T>({
                method,
                url,
                params: options.params,
                data: options.data,
                headers,
            });
            return response.data;
        } catch (err) {
            if (axios.isAxiosError(err)) {
                const status = err.response?.status;
                const message =
                    (err.response?.data as { message?: string } | undefined)?.message ?? err.message;
                Logger.error(`Mi Paquete ${method.toUpperCase()} ${url} falló (${status ?? 'sin respuesta'}): ${message}`, loggerCtx);
                throw new MipaqueteApiError(message, `${method.toUpperCase()} ${url}`, status);
            }
            throw err;
        }
    }

    /** Only needed to regenerate the API key by hand (see scripts/mipaquete-generate-api-key.ts) —
     *  the running server always uses the pre-generated MIPAQUETE_API_KEY env var, never calls this
     *  itself (mipaquete-api-v2.md: "no expira por petición, se genera una vez y se reutiliza"). */
    generateApiKey(email: string, password: string): Promise<{ APIKey: string }> {
        return this.request('post', '/generateapikey', { data: { email, password }, skipAuth: true });
    }

    async getLocations(locationCode?: string): Promise<MipaqueteLocation[]> {
        if (locationCode) {
            return this.request<MipaqueteLocation[]>('get', '/getLocations', { params: { locationCode } });
        }
        if (this.locationsCache && Date.now() - this.locationsCache.fetchedAt < MIPAQUETE_CATALOG_CACHE_TTL_MS) {
            return this.locationsCache.data;
        }
        const data = await this.request<MipaqueteLocation[]>('get', '/getLocations');
        this.locationsCache = { fetchedAt: Date.now(), data };
        return data;
    }

    async getDeliveryCompanies(): Promise<MipaqueteDeliveryCompany[]> {
        if (
            this.deliveryCompaniesCache &&
            Date.now() - this.deliveryCompaniesCache.fetchedAt < MIPAQUETE_CATALOG_CACHE_TTL_MS
        ) {
            return this.deliveryCompaniesCache.data;
        }
        const data = await this.request<MipaqueteDeliveryCompany[]>('get', '/getDeliveryCompanies');
        this.deliveryCompaniesCache = { fetchedAt: Date.now(), data };
        return data;
    }

    quoteShipping(input: QuoteShippingInput): Promise<QuoteShippingOption[]> {
        return this.request('post', '/quoteShipping', { data: input });
    }

    createSending(input: CreateSendingInput): Promise<CreateSendingResult> {
        return this.request('post', '/createSending', {
            data: mipaqueteUserId ? { ...input, user: input.user ?? mipaqueteUserId } : input,
        });
    }

    getSendingTracking(mpCode: number): Promise<SendingTrackingResult> {
        return this.request('get', '/getSendingTracking', { params: { mpCode } });
    }

    cancelSending(mpCode: number): Promise<{ message: string }> {
        return this.request('put', '/cancelSending', { data: { mpCode } });
    }
}
