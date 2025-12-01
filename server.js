const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { search: gogoSearch, loadMeta: gogoLoadMeta, loadStream: gogoLoadStream, PROVIDER_NAME: GOGO_NAME } = require('./src/providers/GogoanimeProvider');

// --- Configuration ---
const manifest = {
    id: 'com.manus.cs2stremio',
    version: '1.0.0',
    name: 'Cloudstream Unified Addon',
    description: 'A unified Stremio addon converted from multiple Cloudstream providers (Gogoanime, Bflix, etc.)',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'series',
            id: 'gogoanime_catalog',
            name: 'Gogoanime',
            extra: [{ name: 'search', isRequired: false }]
        },
        // Add other catalogs here as more providers are integrated
    ],
    idPrefixes: [GOGO_NAME],
    behaviorHints: {
        // This addon provides content, not just metadata
        configurable: false,
        // This addon should be prioritized over others for the content it provides
        // This is a common practice for multi-source addons
        priority: 1000 
    }
};

const builder = new addonBuilder(manifest);

// --- Catalog Handler (Search) ---
builder.defineCatalogHandler(async ({ type, id, extra }) => {
    console.log(`Requesting catalog: ${id}, type: ${type}, extra: ${JSON.stringify(extra)}`);

    if (id === 'gogoanime_catalog' && type === 'series') {
        const searchQuery = extra.search;
        if (searchQuery) {
            const metas = await gogoSearch(searchQuery);
            return Promise.resolve({ metas: metas });
        }
        // For now, we only support search. Implement main page logic later if needed.
        return Promise.resolve({ metas: [] });
    }

    return Promise.resolve({ metas: [] });
});

// --- Meta Handler (Details) ---
builder.defineMetaHandler(async ({ type, id }) => {
    console.log(`Requesting meta: ${id}, type: ${type}`);

    if (id.startsWith(GOGO_NAME)) {
        const meta = await gogoLoadMeta(id);
        if (meta) {
            // Stremio expects a single meta object
            return Promise.resolve({ meta: meta });
        }
    }

    return Promise.resolve({ meta: null });
});

// --- Stream Handler (Links) ---
builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`Requesting stream: ${id}, type: ${type}`);

    if (id.startsWith(GOGO_NAME)) {
        const streams = await gogoLoadStream(id);
        return Promise.resolve({ streams: streams });
    }

    return Promise.resolve({ streams: [] });
});

// --- Serve Addon ---
const PORT = process.env.PORT || 7000;
serveHTTP(builder.get = () => builder.getManifest(), { port: PORT });
console.log(`Stremio Addon running at http://127.0.0.1:${PORT}/manifest.json`);
