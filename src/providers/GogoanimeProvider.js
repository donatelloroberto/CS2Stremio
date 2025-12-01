const axios = require('axios');
const cheerio = require('cheerio');
const { cryptoHandler, getKey } = require('../utils/crypto');

const MAIN_URL = "https://anitaku.to";
const AJAX_URL = "https://ajax.gogo-load.com";
const PROVIDER_NAME = "Gogoanime";

// Helper function to make requests
async function makeRequest(url, headers = {}, params = {}) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
                'Referer': MAIN_URL,
                ...headers
            },
            params: params
        });
        return response.data;
    } catch (error) {
        console.error(`Request failed for ${url}:`, error.message);
        return null;
    }
}

/**
 * Translates Cloudstream's search logic to Stremio's catalog/search.
 * @param {string} query 
 * @returns {Promise<Array<object>>}
 */
async function search(query) {
    const url = `${MAIN_URL}/search.html?keyword=${encodeURIComponent(query)}`;
    const html = await makeRequest(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const results = [];

    $('.last_episodes li').each((i, el) => {
        const nameEl = $(el).find('.name a');
        const name = nameEl.text().replace(' (Dub)', '').trim();
        const href = nameEl.attr('href');
        const posterUrl = $(el).find('img').attr('src');
        const yearText = $(el).find('.released').text();
        const yearMatch = yearText.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;

        if (name && href) {
            // Stremio expects a simple array of meta objects for search results
            results.push({
                id: `${PROVIDER_NAME}:${href.replace('/category/', '')}`,
                type: 'series', // Assuming all Gogoanime results are series for simplicity
                name: name,
                poster: posterUrl,
                // The 'id' is the unique identifier for the meta route
                // The 'href' is the path to the anime page, which we'll use in the meta route
                // We encode the full URL path in the ID for simplicity
                // The actual URL is MAIN_URL + href
                url: MAIN_URL + href,
                year: year
            });
        }
    });

    return results;
}

/**
 * Translates Cloudstream's load logic to Stremio's meta route.
 * @param {string} id - The ID from the search result (e.g., "Gogoanime:/category/anime-name")
 * @returns {Promise<object>}
 */
async function loadMeta(id) {
    const urlPath = id.split(':')[1];
    const url = MAIN_URL + urlPath;
    const html = await makeRequest(url);
    if (!html) return null;

    const $ = cheerio.load(html);
    const animeBody = $('#wrapper_bg .anime_info_body_bg');

    const title = animeBody.find('h1').text().trim();
    const poster = animeBody.find('img').attr('src');
    let description = '';
    const genres = [];
    let year = null;
    let status = null;

    animeBody.find('p.type').each((i, el) => {
        const text = $(el).text().trim();
        if (text.startsWith('Plot Summary:')) {
            description = text.replace('Plot Summary:', '').trim();
        } else if (text.startsWith('Genre:')) {
            $(el).find('a').each((j, genreEl) => {
                genres.push($(genreEl).attr('title'));
            });
        } else if (text.startsWith('Released:')) {
            const yearMatch = text.match(/(\d{4})/);
            year = yearMatch ? parseInt(yearMatch[1]) : null;
        } else if (text.startsWith('Status:')) {
            status = text.replace('Status:', '').trim();
        }
    });

    const animeId = $('#movie_id').attr('value');
    const episodeloadApi = `${AJAX_URL}/ajax/load-list-episode`;
    const params = { ep_start: 0, ep_end: 2000, id: animeId };

    const episodeListHtml = await makeRequest(episodeloadApi, {}, params);
    if (!episodeListHtml) return null;

    const $$ = cheerio.load(episodeListHtml);
    const episodes = [];

    $$('a').get().reverse().forEach((el) => {
        const episodeUrlPath = $$(el).attr('href').trim();
        const episodeTitle = $$(el).find('.name').text().replace('EP', '').trim();
        const episodeNumMatch = episodeTitle.match(/(\d+)/);
        const episodeNum = episodeNumMatch ? parseInt(episodeNumMatch[1]) : 1;

        // Stremio expects a list of episodes with season/episode numbers
        episodes.push({
            id: `${PROVIDER_NAME}:${episodeUrlPath}`, // Unique ID for the stream route
            title: `Episode ${episodeNum}: ${episodeTitle}`,
            season: 1, // Gogoanime is usually flat, use season 1
            episode: episodeNum,
            // The URL path to the episode page is stored in the ID
            url: MAIN_URL + episodeUrlPath
        });
    });

    return {
        id: id,
        type: 'series',
        name: title,
        poster: poster,
        description: description,
        genres: genres,
        releaseInfo: year,
        // Stremio requires a list of episodes for series
        videos: episodes,
        // The URL is used to pass the anime page URL to the stream handler
        url: url
    };
}

/**
 * Translates Cloudstream's loadLinks logic to Stremio's stream route.
 * This implements the Gogoanime/Vidstream extraction logic.
 * @param {string} id - The ID of the episode (e.g., "Gogoanime:/anime/anime-name-episode-1")
 * @returns {Promise<Array<object>>}
 */
async function loadStream(id) {
    const urlPath = id.split(':')[1];
    const episodeUrl = MAIN_URL + urlPath;
    const streams = [];

    const html = await makeRequest(episodeUrl);
    if (!html) return [];

    const $ = cheerio.load(html);
    const iframeSrc = $('div.play-video iframe').attr('src');
    if (!iframeSrc) return [];

    const iframeUrl = 'https:' + iframeSrc; // Ensure HTTPS

    // --- Start of extractVidstream logic translation ---
    
    // 1. Get ID from iframe URL
    const idMatch = iframeUrl.match(/id=([^&]+)/);
    if (!idMatch) return [];
    const id = idMatch[1];

    // 2. Fetch iframe document to get IV and Key (or use hardcoded if available)
    // The Kotlin code uses a complex adaptive key system. We will use the hardcoded keys 
    // found in the Kotlin source as a fallback, as they are often more stable.
    // iv = "3134003223491201"
    // secretKey = "37911490979715163134003223491201"
    // secretDecryptKey = "54674138327930866480207815084989"
    
    const hardcodedIv = "3134003223491201";
    const hardcodedKey = "37911490979715163134003223491201";
    const hardcodedDecryptKey = "54674138327930866480207815084989";

    const foundIv = hardcodedIv;
    const foundKey = hardcodedKey;
    const foundDecryptKey = hardcodedDecryptKey;

    // 3. Encrypt the ID
    const encryptedId = cryptoHandler(id, foundIv, foundKey, true);

    // 4. Get data-value for adaptive data (isUsingAdaptiveData = true)
    const iframeHtml = await makeRequest(iframeUrl);
    if (!iframeHtml) return [];
    const $$iframe = cheerio.load(iframeHtml);
    
    const dataEncrypted = $$iframe('script[data-name="episode"]').attr('data-value');
    let encryptRequestData = `id=${encryptedId}&alias=${id}`;

    if (dataEncrypted) {
        const headersDecrypted = cryptoHandler(dataEncrypted, foundIv, foundKey, false);
        // The Kotlin code uses: "id=$encryptedId&alias=$id&" + headers.substringAfter("&")
        // headersDecrypted is a JSON string, we need to parse it or just append the rest of the query string
        // Since we are not dealing with the full Kotlin environment, we'll simplify the data-value usage
        // The common practice is to just use the encrypted ID and the alias, or sometimes the full decrypted data.
        // Let's stick to the simpler form first, as the Kotlin code suggests the complex form is for adaptive data.
        // Given the hardcoded keys, we'll try the simpler form first.
        // Let's try to replicate the exact query string construction from Kotlin:
        // "id=$encryptedId&alias=$id&" + headers.substringAfter("&")
        try {
            const headersDecrypted = cryptoHandler(dataEncrypted, foundIv, foundKey, false);
            const headersQuery = headersDecrypted.split('&').slice(1).join('&');
            encryptRequestData = `id=${encryptedId}&alias=${id}&${headersQuery}`;
        } catch (e) {
            console.warn("Could not use adaptive data logic, falling back to simple ID:", e.message);
            encryptRequestData = `id=${encryptedId}&alias=${id}`;
        }
    }

    // 5. Make the AJAX request
    const uri = new URL(iframeUrl);
    const mainUrl = `https://${uri.host}`;
    const ajaxUrl = `${mainUrl}/encrypt-ajax.php?${encryptRequestData}`;

    const jsonResponse = await makeRequest(ajaxUrl, { 'X-Requested-With': 'XMLHttpRequest' });
    if (!jsonResponse) return [];

    // 6. Decrypt the response
    const dataEncryptedMatch = jsonResponse.match(/\{"data":"([^"]+)"\}/);
    if (!dataEncryptedMatch) return [];
    const dataEncrypted = dataEncryptedMatch[1];

    const dataDecrypted = cryptoHandler(dataEncrypted, foundIv, foundDecryptKey, false);
    
    let sources;
    try {
        sources = JSON.parse(dataDecrypted);
    } catch (e) {
        console.error("Failed to parse decrypted JSON:", e.message);
        return [];
    }

    // 7. Extract stream links
    const allSources = [...(sources.source || []), ...(sources.sourceBk || [])];

    allSources.forEach(source => {
        if (source.file) {
            streams.push({
                name: PROVIDER_NAME,
                title: source.label || 'Unknown Quality',
                url: source.file,
                // Stremio expects a simple URL for the stream
                // The type is determined by the URL (e.g., .m3u8 for HLS)
                // We'll assume the URL is playable directly
            });
        }
    });

    // --- End of extractVidstream logic translation ---

    return streams;
}

module.exports = {
    search,
    loadMeta,
    loadStream,
    PROVIDER_NAME
};
