const axios = require('axios');
const cheerio = require('cheerio');

const TMDB_API_KEY = "1f54bd990f1cdfb230adb312546d765d"; // Placeholder key for structure
const TMDB_BASE_URL = "[https://api.themoviedb.org/3](https://api.themoviedb.org/3)";
const TMDB_IMAGE_URL = "[https://image.tmdb.org/t/p/original](https://image.tmdb.org/t/p/original)";
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
  language: 'en-US',
  query: query,
  include_adult: false,
  };

  const data = await makeRequest(url, {}, params);
  if (!data || !data.results) return [];

  const results = [];

  data.results.forEach(media => {
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
  const mediaType = parts[2];

  if (!tmdbId || !mediaType) return null;

  const isMovie = mediaType === 'movie';
  const type = isMovie ? 'movie' : 'series';
  const append = "credits,external_ids,videos,recommendations,seasons";

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
  videos.push({
  id: `${PROVIDER_NAME}:${tmdbId}:movie:0:0`,
  title: title,
  season: 0,
  episode: 0,
  });
  } else {
  res.seasons?.forEach(season => {
  if (season.season_number > 0 && season.episode_count > 0) {
  for (let i = 1; i <= season.episode_count; i++) {
  videos.push({
  id: `${PROVIDER_NAME}:${tmdbId}:tv:${season.season_number}:${i}`,
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
* @param {string} id - The ID of the episode/movie (e.g., "StreamPlay:12345:movie:0:0")
* @returns {Promise<Array<object>>}
  */
  async function loadStream(id, config) {
  const parts = id.split(':');
  const tmdbId = parts[1];
  const mediaType = parts[2];
  const season = parts[3];
  const episode = parts[4];

  if (!tmdbId || !mediaType) return [];

  const streams = [];
  const isMovie = mediaType === 'movie';
  const TWOEMBED_BASE = "[https://2embed.cc](https://2embed.cc)";

  let embedUrl = isMovie
  ? `${TWOEMBED_BASE}/embed/movie?tmdb=${tmdbId}`
  : `${TWOEMBED_BASE}/embed/tv?tmdb=${tmdbId}&s=${season}&e=${episode}`;

  try {
  const embedPage = await makeRequest(embedUrl);
  if (!embedPage) return [];

  const $ = cheerio.load(embedPage);

  const placeholderStream = {
      name: PROVIDER_NAME,
      title: `[StreamPlay] TMDB ID: ${tmdbId}`,
      url: `https://example.com/placeholder/stream/${tmdbId}`
  };

  streams.push(placeholderStream);

  const resultLimit = config.resultLimit || 5;
  return streams.slice(0, resultLimit);

  } catch (e) {
  console.error(`Error in StreamPlay loadStream for ID ${id}:`, e.message);
  return [];
  }
  }

module.exports = {
search,
loadMeta,
loadStream,
PROVIDER_NAME
};
