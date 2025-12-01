const axios = require('axios');
const cheerio = require('cheerio');
const { encodeVrf, decodeVrf } = require('../utils/crypto');

const MAIN_URL = "https://bflix.ru";
const PROVIDER_NAME = "Bflix";
const MAIN_KEY = "OrAimkpzm6phmN3j"; // From BflixProvider.kt

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
async function search(query, config) {
    // Bflix uses VRF encoding for the search query in the URL
    const encodedQuery = encodeVrf(query, MAIN_KEY);
    const url = `${MAIN_URL}/search?keyword=${encodeURIComponent(query)}&vrf=${encodeURIComponent(encodedQuery)}`;
    const html = await makeRequest(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const results = [];

    $('.filmlist div.item').each((i, el) => {
        const title = $(el).find('h3 a').text().trim();
        const href = $(el).find('a').attr('href');
        const posterUrl = $(el).find('a.poster img').attr('src');
        const isMovie = href.includes("/movie/");
        const qualityInfo = $(el).find('div.quality').text().trim();

        if (title && href) {
            const type = isMovie ? 'movie' : 'series';
            results.push({
                id: `${PROVIDER_NAME}:${href}`,
                type: type,
                name: title,
                poster: posterUrl,
                // Extra info for Stremio meta object
                year: null, // Year is often not in search result
                extra: { quality: qualityInfo }
            });
        }
    });

    return results;
}

/**
 * Translates Cloudstream's load logic to Stremio's meta route.
 * @param {string} id - The ID from the search result (e.g., "Bflix:/movie/movie-name")
 * @returns {Promise<object>}
 */
async function loadMeta(id, config) {
    const urlPath = id.split(':')[1];
    const url = MAIN_URL + urlPath;
    const html = await makeRequest(url);
    if (!html) return null;

    const $ = cheerio.load(html);
    
    const movieid = $('div#watch').attr('data-id');
    if (!movieid) return null;

    const title = $('div.info h1').text().trim();
    const description = $('.info .desc').text().trim();
    const poster = $('img.poster').attr('src') || $('.info .poster img').attr('src');
    const tags = $('div.info .meta div:contains(Genre) a').map((i, el) => $(el).text()).get();
    const isMovie = url.includes("/movie/");
    const type = isMovie ? 'movie' : 'series';

    // Fetch episodes/servers using AJAX
    const movieidEncoded = encodeVrf(movieid, MAIN_KEY);
    const vrfUrl = `${MAIN_URL}/ajax/film/servers?id=${movieid}&vrf=${encodeURIComponent(movieidEncoded)}`;
    
    const serverResponse = await makeRequest(vrfUrl);
    if (!serverResponse || !serverResponse.html) return null;

    const $$episodes = cheerio.load(serverResponse.html);
    const episodes = [];

    $$episodes('div.episode').each((i, el) => {
        const a = $$(el).find('a');
        const href = a.attr('href');
        const episodeTitle = $$(el).find('.episode a span.name').text().trim();
        const secondTitle = $$(el).find('.episode a span').text().replace(/Episode (\d+):|Episode (\d+)-|Episode (\d+)/g, '').trim();
        
        // Extract season and episode number from data-kname
        const dataKname = a.attr('data-kname');
        const parts = dataKname.split('-').map(p => parseInt(p)).filter(n => !isNaN(n));
        const season = parts.length === 2 ? parts[0] : 1;
        const episode = parts.length === 2 ? parts[1] : (i + 1);

        if (href) {
            episodes.push({
                id: `${PROVIDER_NAME}:${href}`, // Unique ID for the stream route
                title: `${secondTitle} ${episodeTitle}`.trim(),
                season: season,
                episode: episode,
                url: MAIN_URL + href
            });
        }
    });

    // For movies, the "episode" is the movie itself
    const videos = type === 'movie' ? [{
        id: `${PROVIDER_NAME}:${urlPath}`,
        title: title,
        season: 1,
        episode: 1,
        url: url
    }] : episodes;

    return {
        id: id,
        type: type,
        name: title,
        poster: poster,
        description: description,
        genres: tags,
        // Stremio requires a list of videos for both movies and series
        videos: videos,
        url: url
    };
}

/**
 * Translates Cloudstream's loadLinks logic to Stremio's stream route.
 * @param {string} id - The ID of the episode/movie (e.g., "Bflix:/movie/movie-name")
 * @returns {Promise<Array<object>>}
 */
async function loadStream(id, config) {
    const urlPath = id.split(':')[1];
    const url = MAIN_URL + urlPath;
    const streams = [];

    const html = await makeRequest(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    
    const movieid = $('div#watch').attr('data-id');
    if (!movieid) return [];

    // Fetch servers using AJAX
    const movieidEncoded = encodeVrf(movieid, MAIN_KEY);
    const vrfUrl = `${MAIN_URL}/ajax/film/servers?id=${movieid}&vrf=${encodeURIComponent(movieidEncoded)}`;
    
    const serverResponse = await makeRequest(vrfUrl);
    if (!serverResponse || !serverResponse.html) return [];

    const $$servers = cheerio.load(serverResponse.html);
    
    // Find the episode/movie element based on the current URL path
    const cleandata = urlPath.replace(MAIN_URL, "");
    
    let episodeElement;
    if (urlPath.includes("/movie/")) {
        // For movies, the episode element is the first one
        episodeElement = $$servers('div.episode').first();
    } else {
        // For series, find the matching episode link
        episodeElement = $$servers(`div.episode a[href="${cleandata}"]`).parent();
        if (episodeElement.length === 0) {
            // Fallback for series link structure
            episodeElement = $$servers(`div.episode a[href="${cleandata.replace(/-full$/, "")}"]`).parent();
        }
    }

    if (episodeElement.length === 0) {
        console.error("Could not find episode element for stream extraction.");
        return [];
    }

    const serversData = episodeElement.find('a').attr('data-ep');
    if (!serversData) {
        console.error("Could not find servers data for stream extraction.");
        return [];
    }

    let servers;
    try {
        servers = JSON.parse(serversData);
    } catch (e) {
        console.error("Failed to parse servers JSON:", e.message);
        return [];
    }

    // Server IDs from BflixProvider.kt: 28: mcloud, 35: mp4upload, 40: streamtape, 41: vidstream, 43: videovard
    const serverIds = ['28', '35', '40', '41', '43'];
    
    for (const serverId of serverIds) {
        const serverUrlId = servers[serverId];
        if (serverUrlId) {
            try {
                // 1. Get the encrypted URL from the server info endpoint
                const infoUrl = `${MAIN_URL}/ajax/episode/info?id=${serverUrlId}`;
                const infoResponse = await makeRequest(infoUrl);
                
                if (infoResponse && infoResponse.url) {
                    // 2. Decode the VRF encrypted URL
                    const decodedUrl = decodeVrf(infoResponse.url, MAIN_KEY);
                    
                    // 3. Load the extractor for the decoded URL
                    // Since we don't have a full extractor system, we'll assume the decoded URL is the final stream URL
                    // In a real-world scenario, this would call a generic extractor function.
                    // For now, we treat the decoded URL as the final stream link.
                    
                    // The original Cloudstream code uses loadExtractor(url, data, subtitleCallback, callback)
                    // We will simplify and assume the decoded URL is the stream link for Stremio.
                    
                    streams.push({
                        name: PROVIDER_NAME,
                        title: `Server ${serverId} (${decodedUrl.includes('.m3u8') ? 'HLS' : 'Direct'})`,
                        url: decodedUrl,
                        // We cannot reliably determine quality or size without further requests,
                        // so we rely on the Stremio player to handle the URL.
                    });
                }
            } catch (e) {
                console.error(`Error processing server ${serverId}:`, e.message);
            }
        }
    }

    // Apply filtering and sorting logic from config (simplified for Bflix as quality is unknown)
    const resultLimit = config.resultLimit || 5;
    
    // Bflix does not provide quality labels in the server info, so we skip quality filtering/sorting for now.
    // We only apply the result limit.
    return streams.slice(0, resultLimit);
}

module.exports = {
    search,
    loadMeta,
    loadStream,
    PROVIDER_NAME
};
