const axios = require('axios');
const cheerio = require('cheerio');

const TMDB_API_KEY = "1f54bd990f1cdfb230adb312546d765d"; // Placeholder key for structure
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_URL = "https://image.tmdb.org/t/p/original";
const PROVIDER_NAME = "StreamPlay";

// Helper function to make requests
async function makeRequest(url, headers = {}, params = {}) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
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

function getImageUrl(path) {
    if (!path) return null;
    return `${TMDB_IMAGE_URL}${path}`;
}

/**
 * Translates StreamPlay's TMDB-based search logic to Stremio's catalog/search.
 * @param {string} query 
 * @returns {Promise<Array<object>>}
 */
async function search(query, config) {
    const url = `${TMDB_BASE_URL}/search/multi`;
    const params = {
        api_key: TMDB_API_KEY,
        language: 'en-US', // Simplified language code
        query: query,
        include_adult: false, // Simplified adult content setting
    };

    const data = await makeRequest(url, {}, params);
    if (!data || !data.results) return [];

    const results = [];

    data.results.forEach(media => {
        // Filter out non-movie/series types (e.g., person)
        if (media.media_type === 'movie' || media.media_type === 'tv') {
            const isMovie = media.media_type === 'movie';
            const type = isMovie ? 'movie' : 'series';
            const name = media.title || media.name || media.original_title || media.original_name;
            const year = (media.release_date || media.first_air_date)?.substring(0, 4);

            if (name) {
                results.push({
                    id: `${PROVIDER_NAME}:${media.id}:${media.media_type}`,
                    type: type,
                    name: name,
                    poster: getImageUrl(media.poster_path),
                    year: year,
                    // We use the TMDB ID and media_type in the Stremio ID for the meta route
                });
            }
        }
    });

    return results;
}

/**
 * Translates StreamPlay's TMDB-based load logic to Stremio's meta route.
 * @param {string} id - The ID from the search result (e.g., "StreamPlay:12345:movie")
 * @returns {Promise<object>}
 */
async function loadMeta(id, config) {
    const parts = id.split(':');
    const tmdbId = parts[1];
    const mediaType = parts[2]; // 'movie' or 'tv'

    if (!tmdbId || !mediaType) return null;

    const isMovie = mediaType === 'movie';
    const type = isMovie ? 'movie' : 'series';
    const append = "credits,external_ids,videos,recommendations,seasons"; // Simplified appends

    const url = `${TMDB_BASE_URL}/${mediaType}/${tmdbId}`;
    const params = {
        api_key: TMDB_API_KEY,
        language: 'en-US',
        append_to_response: append
    };

    const res = await makeRequest(url, {}, params);
    if (!res) return null;

    const title = res.title || res.name;
    const poster = getImageUrl(res.poster_path);
    const description = res.overview;
    const genres = res.genres?.map(g => g.name) || [];
    const year = (res.release_date || res.first_air_date)?.substring(0, 4);
    const imdbId = res.external_ids?.imdb_id;

    const videos = [];

    if (isMovie) {
        // For movies, the "episode" is the movie itself
        videos.push({
            id: `${PROVIDER_NAME}:${tmdbId}:movie:0:0`, // TMDB ID + type + S0E0
            title: title,
            season: 0,
            episode: 0,
            // The URL is not needed here, but the ID is crucial for the stream handler
        });
    } else {
        // For TV series, fetch episodes from seasons
        res.seasons?.forEach(season => {
            // Only process seasons that have episodes and are not special (like season 0)
            if (season.season_number > 0 && season.episode_count > 0) {
                // We need to fetch the full season details to get episode-level data
                // For simplicity and performance, we will only create episode placeholders
                // The full StreamPlay logic fetches episode details, which is too complex for this phase.
                // We will rely on the StreamPlay stream handler to use the TMDB ID to find the content.
                for (let i = 1; i <= season.episode_count; i++) {
                    videos.push({
                        id: `${PROVIDER_NAME}:${tmdbId}:tv:${season.season_number}:${i}`, // TMDB ID + type + S#E#
                        title: `S${season.season_number} E${i}`,
                        season: season.season_number,
                        episode: i,
                    });
                }
            }
        });
    }

    return {
        id: id,
        type: type,
        name: title,
        poster: poster,
        description: description,
        genres: genres,
        releaseInfo: year,
        imdb_id: imdbId,
        videos: videos,
    };
}

/**
 * Placeholder for StreamPlay's stream logic.
 * This will be implemented in the next phase (Phase 15).
 * @param {string} id - The ID of the episode/movie (e.g., "StreamPlay:12345:movie:0:0")
 * @returns {Promise<Array<object>>}
 */
async function loadStream(id, config) {
    const parts = id.split(':');
    const tmdbId = parts[1];
    const mediaType = parts[2]; // 'movie' or 'tv'
    const season = parts[3];
    const episode = parts[4];

    if (!tmdbId || !mediaType) return [];

    const streams = [];
    const isMovie = mediaType === 'movie';

    // Simplified StreamPlay logic: Query a single key embed source (TwoEmbed-like)
    // In the original Cloudstream, this would be a parallel call to multiple internal providers.
    // We will simulate one key provider for proof of concept.
    const TWOEMBED_BASE = "https://2embed.cc"; // A common embed host

    let embedUrl;
    if (isMovie) {
        embedUrl = `${TWOEMBED_BASE}/embed/movie?tmdb=${tmdbId}`;
    } else {
        embedUrl = `${TWOEMBED_BASE}/embed/tv?tmdb=${tmdbId}&s=${season}&e=${episode}`;
    }

    try {
        // 1. Fetch the embed page to find the actual stream source
        const embedPage = await makeRequest(embedUrl);
        if (!embedPage) return [];

        const $ = cheerio.load(embedPage);
        
        // The embed page usually contains an iframe or a script that loads the final player.
        // We will look for common stream URLs or player data.
        // Since we cannot execute the full JS on the embed page, we will simulate the result
        // by returning a placeholder stream link that indicates the source.
        
        // In a real implementation, this would involve complex scraping of the embed page
        // to find the final M3U8 or MP4 link, often requiring a separate extractor.
        
        // For now, we return a placeholder stream link to demonstrate the flow.
        // The actual StreamPlay logic would call an extractor for the embedUrl.
        
        // Placeholder for a direct stream link (e.g., from a resolved extractor)
    const placeholderStream = {
    name: PROVIDER_NAME,
    title: '[StreamPlay] TMDB ID: ' + tmdbId,
    url: 'https://example.com/placeholder/stream/' + tmdbId // Placeholder URL
};

        
        streams.push(placeholderStream);

        // Apply filtering and sorting logic from config (simplified as we only have one stream)
        const resultLimit = config.resultLimit || 5;
        
        // Since we cannot determine quality/size from the TMDB ID alone, we only apply the limit.
        return streams.slice(0, resultLimit);

    } catch (e) {
        console.error(`Error in StreamPlay loadStream for ID \${id}:`, e.message);
        return [];
    }
}

module.exports = {
    search,
    loadMeta,
    loadStream,
    PROVIDER_NAME
};
