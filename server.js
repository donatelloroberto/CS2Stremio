const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { search: gogoSearch, loadMeta: gogoLoadMeta, loadStream: gogoLoadStream, PROVIDER_NAME: GOGO_NAME } = require('./src/providers/GogoanimeProvider');
const { search: bflixSearch, loadMeta: bflixLoadMeta, loadStream: bflixLoadStream, PROVIDER_NAME: BFLIX_NAME } = require('./src/providers/BflixProvider');
const { URLSearchParams } = require('url');

// --- Configuration ---
const manifest = {
    id: 'com.manus.cs2stremio',
    // Mark the addon as configurable
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
            id: 'bflix_movie_catalog',
            name: 'Bflix (Movies)',
            extra: [{ name: 'search', isRequired: false }]
        },
        {
            type: 'series',
            id: 'bflix_series_catalog',
            name: 'Bflix (Series)',
            extra: [{ name: 'search', isRequired: false }]
        },
        // Add other catalogs here as more providers are integrated
    ],
    idPrefixes: [GOGO_NAME, BFLIX_NAME],
    // Define the configuration page URL structure
    config: [
        {
            key: 'providers',
            type: 'checkbox',
            options: [GOGO_NAME], // Will be dynamically updated with all providers
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
        // This addon provides content, not just metadata
        configurable: true,
        // This addon should be prioritized over others for the content it provides
        // This is a common practice for multi-source addons
        priority: 1000 
    }
};

const builder = new addonBuilder(manifest);

// Function to parse the configuration from the addon ID
function parseConfig(addonId) {
    if (!addonId) return {};
    try {
        const configString = addonId.split('/').pop();
        const params = new URLSearchParams(configString);
        const config = {};
        for (const [key, value] of params.entries()) {
            // Handle array-like values from checkboxes
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
        return {};
    }
}

// Global list of all available providers (for dynamic manifest update)
const ALL_PROVIDERS = [GOGO_NAME, BFLIX_NAME];

// Update manifest with all providers
manifest.config.find(c => c.key === 'providers').options = ALL_PROVIDERS;
manifest.config.find(c => c.key === 'providers').default = ALL_PROVIDERS;

// --- Helper function to get config and pass it to providers ---
function getConfigAndCall(handler, args) {
    const config = parseConfig(args.addonId);
    return handler(args, config);
}

// --- Catalog Handler (Search) ---
builder.defineCatalogHandler(async (args) => {
    const { type, id, extra } = args;
    const config = parseConfig(args.addonId);

    console.log(\`Requesting catalog: \${id}, type: \${type}, extra: \${JSON.stringify(extra)}, config: \${JSON.stringify(config)}\`);
    console.log(`Requesting catalog: ${id}, type: ${type}, extra: ${JSON.stringify(extra)}`);

    if (id === 'gogoanime_catalog' && type === 'series') {
        const searchQuery = extra.search;
        if (searchQuery) {
            const metas = await gogoSearch(searchQuery, config);
            return Promise.resolve({ metas: metas });
        }
        // For now, we only support search. Implement main page logic later if needed.
        return Promise.resolve({ metas: [] });
    } else if ((id === 'bflix_movie_catalog' && type === 'movie') || (id === 'bflix_series_catalog' && type === 'series')) {
        const searchQuery = extra.search;
        if (searchQuery) {
            const metas = await bflixSearch(searchQuery, config);
            // Filter Bflix results by type for the specific catalog
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

    console.log(\`Requesting meta: \${id}, type: \${type}, config: \${JSON.stringify(config)}\`);
    console.log(`Requesting meta: ${id}, type: ${type}`);

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
    }

    return Promise.resolve({ meta: null });
});

// --- Stream Handler (Links) ---
builder.defineStreamHandler(async (args) => {
    const { type, id } = args;
    const config = parseConfig(args.addonId);

    console.log(\`Requesting stream: \${id}, type: \${type}, config: \${JSON.stringify(config)}\`);
    console.log(`Requesting stream: ${id}, type: ${type}`);

    if (id.startsWith(GOGO_NAME) && config.providers.includes(GOGO_NAME)) {
        const streams = await gogoLoadStream(id, config);
        return Promise.resolve({ streams: streams });
    } else if (id.startsWith(BFLIX_NAME) && config.providers.includes(BFLIX_NAME)) {
        const streams = await bflixLoadStream(id, config);
        return Promise.resolve({ streams: streams });
    }

    return Promise.resolve({ streams: [] });
});

// --- Serve Addon ---
const PORT = process.env.PORT || 7000;
serveHTTP(builder.get = () => builder.getManifest(), { port: PORT });
console.log(`Stremio Addon running at http://127.0.0.1:${PORT}/manifest.json`);
