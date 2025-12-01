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
 */
async function search(query, config) {
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
            results.push({
                id: `${PROVIDER_NAME}:${href.replace('/category/', '')}`,
                type: 'series',
                name: name,
                poster: posterUrl,
                url: MAIN_URL + href,
                year: year
            });
        }
    });

    return results;
}

/**
 * Translates Cloudstream's load logic to Stremio's meta route.
 */
async function loadMeta(id, config) {
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

        episodes.push({
            id: `${PROVIDER_NAME}:${episodeUrlPath}`,
            title: `Episode ${episodeNum}: ${episodeTitle}`,
            season: 1,
            episode: episodeNum,
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
        videos: episodes,
        url: url
    };
}

/**
 * Translates Cloudstream's loadLinks logic to Stremio's stream route.
 */
async function loadStream(id, config) {
    const urlPath = id.split(':')[1];
    const episodeUrl = MAIN_URL + urlPath;
    const streams = [];

    const html = await makeRequest(episodeUrl);
    if (!html) return [];

    const $ = cheerio.load(html);
    const iframeSrc = $('div.play-video iframe').attr('src');
    if (!iframeSrc) return [];

    const iframeUrl = 'https:' + iframeSrc;

    // 1. Extract episodeId
    const idMatch = iframeUrl.match(/id=([^&]+)/);
    if (!idMatch) return [];
    const episodeId = idMatch[1];

    // Hardcoded crypto keys
    const hardcodedIv = "3134003223491201";
    const hardcodedKey = "37911490979715163134003223491201";
    const hardcodedDecryptKey = "54674138327930866480207815084989";

    const foundIv = hardcodedIv;
    const foundKey = hardcodedKey;
    const foundDecryptKey = hardcodedDecryptKey;

    // Encrypt episodeId
    const encryptedId = cryptoHandler(episodeId, foundIv, foundKey, true);

    // Get adaptive data
    const iframeHtml = await makeRequest(iframeUrl);
    if (!iframeHtml) return [];

    const $$iframe = cheerio.load(iframeHtml);
    const dataEncrypted = $$iframe('script[data-name="episode"]').attr('data-value');

    let encryptRequestData = `id=${encryptedId}&alias=${episodeId}`;

    if (dataEncrypted) {
        try {
            const headersDecrypted = cryptoHandler(dataEncrypted, foundIv, foundKey, false);
            const headersQuery = headersDecrypted.split('&').slice(1).join('&');
            encryptRequestData = `id=${encryptedId}&alias=${episodeId}&${headersQuery}`;
        } catch (e) {
            console.warn("Adaptive data decrypt failed:", e.message);
        }
    }

    // Prepare AJAX URL
    const uri = new URL(iframeUrl);
    const mainUrl = `https://${uri.host}`;
    const ajaxUrl = `${mainUrl}/encrypt-ajax.php?${encryptRequestData}`;

    const jsonResponse = await makeRequest(ajaxUrl, { 'X-Requested-With': 'XMLHttpRequest' });
    if (!jsonResponse) return [];

    // Decrypt stream JSON
    const dataEncryptedMatch = jsonResponse.match(/\{"data":"([^"]+)"\}/);
    if (!dataEncryptedMatch) return [];

    const decrypted = cryptoHandler(dataEncryptedMatch[1], foundIv, foundDecryptKey, false);

    let sources;
    try {
        sources = JSON.parse(decrypted);
    } catch (e) {
        console.error("JSON parse fail:", e.message);
        return [];
    }

    let allSources = [...(sources.source || []), ...(sources.sourceBk || [])];

    const preferredQuality = config.qualities;
    const resultLimit = config.resultLimit || 5;

    let filteredSources = allSources.filter(src => {
        if (preferredQuality === 'Any') return true;
        return src.label && src.label.includes(preferredQuality.replace('p', ''));
    });

    if (config.sortMode === 'best quality first') {
        const order = ['2160p', '1080p', '720p', '480p'];
        filteredSources.sort((a, b) => {
            const ai = order.findIndex(q => a.label && a.label.includes(q.replace('p', '')));
            const bi = order.findIndex(q => b.label && b.label.includes(q.replace('p', '')));
            return ai - bi;
        });
    }

    filteredSources = filteredSources.slice(0, resultLimit);

    filteredSources.forEach(source => {
        if (source.file) {
            streams.push({
                name: PROVIDER_NAME,
                title: source.label || 'Unknown Quality',
                url: source.file
            });
        }
    });

    return streams;
}

module.exports = {
    search,
    loadMeta,
    loadStream,
    PROVIDER_NAME
};
