import { LanguageCode } from '@vendure/common/lib/generated-types';
import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { defineConfig } from 'vite';

export default defineConfig({
    base: '/dashboard',
    build: {
        outDir: join(__dirname, 'dist/dashboard'),
    },
    plugins: [
        vendureDashboardPlugin({
            // The vendureDashboardPlugin will scan your configuration in order
            // to find any plugins which have dashboard extensions, as well as
            // to introspect the GraphQL schema based on any API extensions
            // and custom fields that are configured.
            vendureConfigPath: pathToFileURL('./src/vendure-config.ts'),
            // Patilandia brand palette (see patilandia/src/app/globals.css for the source of
            // truth — --brand-violet / --brand-violet-deep / --brand-soft). There's no supported
            // way to swap the Dashboard's own wordmark from the authenticated app shell (it shows
            // the active Channel, not a Vendure logo — only the login screen has one, handled via
            // the `login.logo` extension in dashboard/index.tsx), so brand colors + the login logo
            // are the two real branding levers this phase of the Dashboard extension API gives us.
            theme: {
                light: {
                    primary: '#7261ff',
                    'primary-foreground': '#ffffff',
                    brand: '#7261ff',
                    'brand-lighter': '#efeaff',
                    'brand-darker': '#20308d',
                    ring: '#7261ff',
                    sidebar: '#fffaf3',
                    'sidebar-primary': '#7261ff',
                    'sidebar-primary-foreground': '#ffffff',
                    'sidebar-accent': '#efeaff',
                    'sidebar-accent-foreground': '#20308d',
                    'sidebar-ring': '#7261ff',
                },
                dark: {
                    primary: '#9a8bff',
                    'primary-foreground': '#191339',
                    brand: '#9a8bff',
                    'brand-lighter': '#2a2360',
                    'brand-darker': '#20308d',
                    ring: '#9a8bff',
                    'sidebar-primary': '#9a8bff',
                    'sidebar-primary-foreground': '#191339',
                    'sidebar-accent': '#2a2360',
                },
            },
            // The Dashboard UI chrome (menu labels, buttons, etc.) defaults to English regardless
            // of the channel's content language — Patilandia is Spanish-only, so switch it here
            // too. 'es' translations ship with @vendure/dashboard itself (src/i18n/locales/es.po).
            i18n: {
                defaultLanguage: LanguageCode.es,
                defaultLocale: 'CO',
                availableLanguages: [LanguageCode.en, LanguageCode.es],
            },
            // Points to the location of your Vendure server.
            // In production, 'auto' lets the dashboard derive the API URL from the
            // server that serves it. In development, we use explicit defaults so that
            // the Vite dev server can reach the Vendure backend.
            api: process.env.NODE_ENV === 'production'
                ? { host: 'auto', port: 'auto' }
                : { host: 'http://localhost', port: 3000 },
            // When you start the Vite server, your Admin API schema will
            // be introspected and the types will be generated in this location.
            // These types can be used in your dashboard extensions to provide
            // type safety when writing queries and mutations.
            gqlOutputPath: './src/gql',
        }),
    ],
    resolve: {
        alias: {
            // This allows all plugins to reference a shared set of
            // GraphQL types.
            '@/gql': resolve(__dirname, './src/gql/graphql.ts'),
        },
    },
});
