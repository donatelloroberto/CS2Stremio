const { addonBuilder, serveHTTP, getRouter } = require('stremio-addon-sdk');
const { search: gogoSearch, loadMeta: gogoLoadMeta, loadStream: gogoLoadStream, PROVIDER_NAME: GOGO_NAME } = require('./src/providers/GogoanimeProvider');
const { search: bflixSearch, loadMeta: bflixLoadMeta, loadStream: bflixLoadStream, PROVIDER_NAME: BFLIX_NAME } = require('./src/providers/BflixProvider');
const { search: streamPlaySearch, loadMeta: streamPlayLoadMeta, loadStream: streamPlayLoadStream, PROVIDER_NAME: STREAMPLAY_NAME } = require('./src/providers/StreamPlayProvider');
const { URLSearchParams } = require('url');
const customLandingTemplate = require('./src/customLandingTemplate');

// --- Configuration ---
const manifest = {
    id: 'com.manus.cs2stremio',
    configurable: true,
    version: '1.0.0',
    name: 'Cloudstream Unified Addon',
    description: 'A unified Stremio addon converted from multiple Cloudstream providers (Gogoanime, Bflix, etc.)',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'series',
            id: 'gogoanime_catalog',
            name: 'Gogoanime (Anime)',
            extra: [{ name: 'search', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'streamplay_movie_catalog',
            name: 'StreamPlay (Movies)',
            extra: [{ name: 'search', isRequired: false }]
        },
        {
            type: 'series',
            id: 'streamplay_series_catalog',
            name: 'StreamPlay (Series)',
            extra: [{ name: 'search', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'bflix_movie_catalog',
            name: 'Bflix (Movies)',
            extra: [{ name: 'search', isRequired: false }]
        },
        {
            type: 'series',
            id: 'bflix_series_catalog',
            name: 'Bflix (Series)',
            extra: [{ name: 'search', isRequired: false }]
        }
    ],
    idPrefixes: [GOGO_NAME, BFLIX_NAME, STREAMPLAY_NAME],
    config: [
        {
            key: 'providers',
            type: 'checkbox',
            options: [GOGO_NAME],
            default: [GOGO_NAME],
            title: 'Enabled Providers',
            required: true
        },
        {
            key: 'languages',
            type: 'select',
            options: ['Any', 'EN', 'ES', 'FR', 'IT', 'DE', 'PT', 'AR'],
            default: 'Any',
            title: 'Preferred Audio/Voice Language',
            required: true
        },
        {
            key: 'qualities',
            type: 'select',
            options: ['Any', '2160p', '1080p', '720p', '480p'],
            default: 'Any',
            title: 'Preferred Video Quality',
            required: true
        },
        {
            key: 'resultLimit',
            type: 'number',
            default: 5,
            title: 'Max Streams per Quality',
            required: true
        },
        {
            key: 'sortMode',
            type: 'select',
            options: ['best quality first', 'lowest size first', 'fastest host first'],
            default: 'best quality first',
            title: 'Stream Sorting Mode',
            required: true
        }
    ],
    behaviorHints: {
        configurable: true,
        priority: 1000 
    }
};

const builder = new addonBuilder(manifest);

// Function to parse the configuration from the addon ID with defaults
function parseConfig(addonId) {
    const defaults = {
        providers: [GOGO_NAME, BFLIX_NAME, STREAMPLAY_NAME],
        resultLimit: 5,
        languages: 'Any',
        qualities: 'Any',
        sortMode: 'best quality first'
    };

    if (!addonId) return defaults;

    try {
        const configString = addonId.split('/').pop();
        const params = new URLSearchParams(configString);
        const config = { ...defaults };

        for (const [key, value] of params.entries()) {
            if (key === 'providers') {
                config[key] = value.split(',');
            } else if (key === 'resultLimit') {
                config[key] = parseInt(value);
            } else {
                config[key] = value;
            }
        }
        return config;
    } catch (e) {
        console.error("Error parsing config:", e);
        return defaults;
    }
}

// Global list of all available providers
const ALL_PROVIDERS = [GOGO_NAME, BFLIX_NAME, STREAMPLAY_NAME];

// Update manifest with all providers
manifest.config.find(c => c.key === 'providers').options = ALL_PROVIDERS;
manifest.config.find(c => c.key === 'providers').default = ALL_PROVIDERS;

// --- Catalog Handler (Search) ---
builder.defineCatalogHandler(async (args) => {
    const { type, id, extra } = args;
    const config = parseConfig(args.addonId);

    console.log(`Requesting catalog: ${id}, type: ${type}, extra: ${JSON.stringify(extra)}, config: ${JSON.stringify(config)}`);

    if (id === 'gogoanime_catalog' && type === 'series') {
        const searchQuery = extra.search;
        if (searchQuery) {
            const metas = await gogoSearch(searchQuery, config);
            return Promise.resolve({ metas: metas });
        }
        return Promise.resolve({ metas: [] });
    } else if ((id === 'bflix_movie_catalog' && type === 'movie') || (id === 'bflix_series_catalog' && type === 'series')) {
        const searchQuery = extra.search;
        if (searchQuery) {
            const metas = await bflixSearch(searchQuery, config);
            const filteredMetas = metas.filter(meta => meta.type === type);
            return Promise.resolve({ metas: filteredMetas });
        }
        return Promise.resolve({ metas: [] });
    } else if ((id === 'streamplay_movie_catalog' && type === 'movie') || (id === 'streamplay_series_catalog' && type === 'series')) {
        const searchQuery = extra.search;
        if (searchQuery) {
            const metas = await streamPlaySearch(searchQuery, config);
            const filteredMetas = metas.filter(meta => meta.type === type);
            return Promise.resolve({ metas: filteredMetas });
        }
        return Promise.resolve({ metas: [] });
    }

    return Promise.resolve({ metas: [] });
});

// --- Meta Handler (Details) ---
builder.defineMetaHandler(async (args) => {
    const { type, id } = args;
    const config = parseConfig(args.addonId);

    console.log(`Requesting meta: ${id}, type: ${type}, config: ${JSON.stringify(config)}`);

    try {
        if (id.startsWith(GOGO_NAME)) {
            const meta = await gogoLoadMeta(id, config);
            if (meta) {
                return Promise.resolve({ meta: meta });
            }
        } else if (id.startsWith(BFLIX_NAME)) {
            const meta = await bflixLoadMeta(id, config);
            if (meta) {
                return Promise.resolve({ meta: meta });
            }
        } else if (id.startsWith(STREAMPLAY_NAME)) {
            const meta = await streamPlayLoadMeta(id, config);
            if (meta) {
                return Promise.resolve({ meta: meta });
            }
        }
    } catch (error) {
        console.error(`Error loading meta for ${id}:`, error);
    }

    return Promise.resolve({ meta: null });
});

// --- Stream Handler (Links) ---
builder.defineStreamHandler(async (args) => {
    const { type, id } = args;
    const config = parseConfig(args.addonId);
    const enabledProviders = config.providers || ALL_PROVIDERS;

    console.log(`Requesting stream: ${id}, type: ${type}, config: ${JSON.stringify(config)}`);

    try {
        if (id.startsWith(GOGO_NAME) && enabledProviders.includes(GOGO_NAME)) {
            const streams = await gogoLoadStream(id, config);
            return Promise.resolve({ streams: streams });
        } else if (id.startsWith(BFLIX_NAME) && enabledProviders.includes(BFLIX_NAME)) {
            const streams = await bflixLoadStream(id, config);
            return Promise.resolve({ streams: streams });
        } else if (id.startsWith(STREAMPLAY_NAME) && enabledProviders.includes(STREAMPLAY_NAME)) {
            const streams = await streamPlayLoadStream(id, config);
            return Promise.resolve({ streams: streams });
        }
    } catch (error) {
        console.error(`Error loading streams for ${id}:`, error);
    }

    return Promise.resolve({ streams: [] });
});

// --- Serve Addon (Conditional for Local Development) ---
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 7000;
    serveHTTP(builder.getInterface(), { port: PORT });
    console.log(`Stremio Addon running at http://127.0.0.1:${PORT}/manifest.json`);
}

// --- Vercel/Serverless Export with Custom Landing Page ---
// For Vercel deployment, we create a custom handler that includes our enhanced landing page
if (process.env.VERCEL) {
    const addonInterface = builder.getInterface();
    const router = getRouter(addonInterface);
    const hasConfig = !!(addonInterface.manifest.config || []).length;
    const landingHTML = customLandingTemplate(addonInterface.manifest);

    // Add custom landing page routes with Vercel Web Analytics
    const originalGet = router.get.bind(router);
    
    // Override root route
    router.get('/', (req, res) => {
        if (hasConfig) {
            res.writeHead(302, { 'Location': '/configure' });
            res.end();
        } else {
            res.setHeader('content-type', 'text/html');
            res.end(landingHTML);
        }
    });

    // Add configure route for configurable addons
    if (hasConfig) {
        router.get('/configure', (req, res) => {
            res.setHeader('content-type', 'text/html');
            res.end(landingHTML);
        });
    }

    module.exports = router;
} else {
    // For non-Vercel environments (like local development with direct export)
    module.exports = builder.getInterface();
}
