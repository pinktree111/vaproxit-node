/**
 * Vavoo.to Italy - Stremio Addon
 * 
 * Questo addon permette di visualizzare i canali italiani di Vavoo.to su Stremio
 */

// Richiedi i moduli
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');

// Addon configuration
const ADDON_NAME = "Vavoo.to Italy";
const ADDON_ID = "com.stremio.vavoo.italy";
const ADDON_VERSION = "1.0.0";
const VAVOO_API_URL = "https://vavoo.to/channels";
const VAVOO_STREAM_BASE_URL = "https://vavoo.to/play/{id}/index.m3u8";

// Default headers
const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36",
    "Referer": "https://vavoo.to/",
    "Origin": "https://vavoo.to"
};

// Cache configuration
let channelsCache = [];
let cacheTimestamp = 0;
const CACHE_DURATION = 600; // 10 minutes in seconds

// Prova a caricare i loghi, o crea un oggetto vuoto se il file non esiste
function loadLogos() {
    try {
        const logosFilePath = path.join(__dirname, 'canali_con_loghi_finale.json');
        
        // Verifica se il file esiste
        if (fs.existsSync(logosFilePath)) {
            const logosData = JSON.parse(fs.readFileSync(logosFilePath, 'utf-8'));
            
            // Create a dictionary without normalizing names
            const logosDict = {};
            for (const channel of logosData) {
                if (channel.name) {
                    // Use the exact channel name as key
                    logosDict[channel.name] = channel.logo || "";
                }
            }
            
            console.log(`Caricati ${Object.keys(logosDict).length} loghi dei canali`);
            return logosDict;
        } else {
            console.warn("File dei loghi non trovato:", logosFilePath);
            return {};
        }
    } catch (error) {
        console.error(`Error loading logos: ${error.message}`);
        return {};
    }
}

// Load logos at startup
const channelLogos = loadLogos();

// Find logo for a channel with direct comparison
function findLogoForChannel(channelName) {
    // Check for exact match without normalization
    if (channelName && channelName in channelLogos) {
        return channelLogos[channelName];
    }
    
    // If no logo is found, return a placeholder URL
    return `https://placehold.co/300x300?text=${encodeURIComponent(channelName || 'TV')}&.jpg`;
}

// Function to load and filter Italian channels from vavoo.to
async function loadItalianChannels() {
    const currentTime = Date.now() / 1000;
    
    // Use cache if available and not expired
    if (channelsCache.length > 0 && currentTime - cacheTimestamp < CACHE_DURATION) {
        return channelsCache;
    }
    
    try {
        const response = await axios.get(VAVOO_API_URL, { 
            headers: DEFAULT_HEADERS,
            timeout: 10000  // 10 secondi timeout
        });
        
        if (!response.data || !Array.isArray(response.data)) {
            console.error("Risposta API non valida:", response.data);
            return channelsCache.length > 0 ? channelsCache : [];
        }
        
        const allChannels = response.data;
        const italianChannels = allChannels.filter(ch => ch && ch.country === "Italy");
        
        console.log(`Caricati ${italianChannels.length} canali italiani`);
        
        // Update cache
        channelsCache = italianChannels;
        cacheTimestamp = currentTime;
        
        return italianChannels;
    } catch (error) {
        console.error(`Error loading channels: ${error.message}`);
        return channelsCache.length > 0 ? channelsCache : [];
    }
}

// Determine channel genre based on name
function getChannelGenre(channelName) {
    if (!channelName) return "GENERAL";
    
    const lowerName = channelName.toLowerCase();
    
    const genres = {
        "SPORT": ["sport", "calcio", "football", "tennis", "basket", "motogp", "f1", "golf"],
        "NEWS": ["news", "tg", "24", "meteo", "giornale", "notizie"],
        "KIDS": ["kids", "bambini", "cartoon", "disney", "nick", "boing", "junior"],
        "MOVIES": ["cinema", "film", "movie", "premium", "comedy"],
        "DOCUMENTARIES": ["discovery", "history", "national", "geo", "natura", "science"],
        "MUSIC": ["music", "mtv", "vh1", "radio", "hit", "rock"]
    };
    
    for (const [genre, keywords] of Object.entries(genres)) {
        for (const keyword of keywords) {
            if (lowerName.includes(keyword)) {
                return genre;
            }
        }
    }
    
    return "GENERAL";
}

// Create a new Stremio addon builder
const addon = new addonBuilder({
    id: ADDON_ID,
    version: ADDON_VERSION,
    name: ADDON_NAME,
    description: "Canali italiani da vavoo.to",
    resources: ["catalog", "meta", "stream"],
    types: ["tv"],
    catalogs: [
        {
            type: "tv",
            id: "vavoo_italy",
            name: "Vavoo.to Italia",
            extra: [{ name: "search", isRequired: false }]
        }
    ],
    behaviorHints: {
        configurable: false,
        configurationRequired: false
    },
    logo: "https://vavoo.to/favicon.ico",
    background: "https://via.placeholder.com/1280x720/000080/FFFFFF?text=Vavoo.to%20Italia",
    contactEmail: "example@example.com" // Replace with real email if needed
});

// Define catalog handler
addon.defineCatalogHandler(async ({ type, id, extra }) => {
    console.log(`Catalog request received: ${type}/${id}`);
    
    // Check if type and id match supported ones
    if (type !== "tv" || id !== "vavoo_italy") {
        return { metas: [] };
    }
    
    const search = extra && extra.search ? extra.search : "";
    const skip = extra && extra.skip ? parseInt(extra.skip) : 0;
    
    let channels = await loadItalianChannels();
    
    // Filter by search if specified
    if (search) {
        const searchLower = search.toLowerCase();
        channels = channels.filter(ch => ch && ch.name && ch.name.toLowerCase().includes(searchLower));
    }
    
    // Apply pagination
    channels = channels.slice(skip, skip + 100);
    
    const metas = channels.map(channel => {
        const genre = getChannelGenre(channel.name);
        const logoUrl = findLogoForChannel(channel.name);
        
        return {
            id: String(channel.id),
            type: "tv",
            name: channel.name,
            genres: [genre],
            poster: logoUrl,
            posterShape: "square",
            background: `https://via.placeholder.com/1280x720/000080/FFFFFF?text=${encodeURIComponent(channel.name)}`,
            logo: logoUrl
        };
    });
    
    console.log(`Returning ${metas.length} channels`);
    return { metas };
});

// Define meta handler
addon.defineMetaHandler(async ({ type, id }) => {
    console.log(`Meta request received: ${type}/${id}`);
    
    // Check if type is supported
    if (type !== "tv") {
        return { meta: null };
    }
    
    const channels = await loadItalianChannels();
    const channel = channels.find(ch => ch && String(ch.id) === id);
    
    if (!channel) {
        return { meta: null };
    }
    
    const genre = getChannelGenre(channel.name);
    const logoUrl = findLogoForChannel(channel.name);
    
    const meta = {
        id: String(channel.id),
        type: "tv",
        name: channel.name,
        genres: [genre],
        poster: logoUrl,
        posterShape: "square",
        background: `https://via.placeholder.com/1280x720/000080/FFFFFF?text=${encodeURIComponent(channel.name)}`,
        logo: logoUrl
    };
    
    return { meta };
});

// Define stream handler
addon.defineStreamHandler(async ({ type, id }) => {
    console.log(`Stream request received: ${type}/${id}`);
    
    // Check if type is supported
    if (type !== "tv") {
        return { streams: [] };
    }
    
    try {
        // Build stream URL
        const streamUrl = VAVOO_STREAM_BASE_URL.replace("{id}", id);
        
        const channels = await loadItalianChannels();
        const channel = channels.find(ch => ch && String(ch.id) === id);
        const channelName = channel ? channel.name : "Unknown";
        
        // Return stream object for Stremio
        return {
            streams: [
                {
                    url: streamUrl,
                    title: `${channelName} - Vavoo.to Stream`,
                    name: "Vavoo.to"
                }
            ]
        };
    } catch (error) {
        console.error(`Error handling stream request: ${error.message}`);
        return { streams: [] };
    }
});

// Create express app for additional routes
const app = express();
app.use(cors());

// Detect if the content is M3U or M3U8
function detectM3UType(content) {
    if (content && typeof content === 'string' && content.includes("#EXTM3U") && content.includes("#EXTINF")) {
        return "m3u8";
    }
    return "m3u";
}

// M3U proxy endpoint
app.get('/proxy/m3u', async (req, res) => {
    const m3uUrl = req.query.url ? req.query.url.trim() : '';
    if (!m3uUrl) {
        return res.status(400).send("Error: Missing 'url' parameter");
    }
    
    // Extract custom headers from query params
    const headers = { ...DEFAULT_HEADERS };
    for (const [key, value] of Object.entries(req.query)) {
        if (key.toLowerCase().startsWith("header_")) {
            const headerName = decodeURIComponent(key.substring(7)).replace("_", "-");
            headers[headerName] = decodeURIComponent(value).trim();
        }
    }
    
    try {
        const response = await axios.get(m3uUrl, { 
            headers, 
            maxRedirects: 5,
            timeout: 10000  // 10 secondi timeout
        });
        
        const finalUrl = response.request.res.responseUrl || m3uUrl;
        const m3uContent = response.data;
        
        const fileType = detectM3UType(m3uContent);
        
        if (fileType === "m3u") {
            res.set('Content-Type', 'audio/x-mpegurl');
            return res.send(m3uContent);
        }
        
        // Parse URL to get base URL for resolving relative paths
        const parsedUrl = new URL(finalUrl);
        const basePath = parsedUrl.pathname.split('/').slice(0, -1).join('/');
        const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}${basePath}/`;
        
        // Create headers query string
        const headerParams = Object.entries(headers)
            .map(([k, v]) => `header_${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        
        // Modify M3U8 content to proxy TS segments
        const modifiedLines = m3uContent.split('\n').map(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                // Resolve relative URL
                const segmentUrl = new URL(line, baseUrl).href;
                // Create proxied URL
                return `/proxy/ts?url=${encodeURIComponent(segmentUrl)}&${headerParams}`;
            }
            return line;
        });
        
        const modifiedM3u8Content = modifiedLines.join('\n');
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        return res.send(modifiedM3u8Content);
        
    } catch (error) {
        console.error(`Error downloading M3U/M3U8 file: ${error.message}`);
        return res.status(500).send(`Error downloading M3U/M3U8 file: ${error.message}`);
    }
});

// TS proxy endpoint
app.get('/proxy/ts', async (req, res) => {
    const tsUrl = req.query.url ? req.query.url.trim() : '';
    if (!tsUrl) {
        return res.status(400).send("Error: Missing 'url' parameter");
    }
    
    // Extract custom headers from query params
    const headers = {};
    for (const [key, value] of Object.entries(req.query)) {
        if (key.toLowerCase().startsWith("header_")) {
            const headerName = decodeURIComponent(key.substring(7)).replace("_", "-");
            headers[headerName] = decodeURIComponent(value).trim();
        }
    }
    
    try {
        const response = await axios.get(tsUrl, { 
            headers, 
            responseType: 'stream',
            maxRedirects: 5,
            timeout: 15000  // 15 secondi timeout
        });
        
        res.set('Content-Type', 'video/mp2t');
        return response.data.pipe(res);
        
    } catch (error) {
        console.error(`Error downloading TS segment: ${error.message}`);
        return res.status(500).send(`Error downloading TS segment: ${error.message}`);
    }
});

// Status endpoint
app.get('/status', (req, res) => {
    res.json({
        status: "online",
        channels_count: channelsCache.length,
        logos_count: Object.keys(channelLogos).length,
        cache_timestamp: cacheTimestamp,
        cache_age_seconds: cacheTimestamp > 0 ? (Date.now() / 1000) - cacheTimestamp : 0,
        version: ADDON_VERSION
    });
});

// Installation page
app.get('/install', (req, res) => {
    const isHttps = req.headers['x-forwarded-proto'] === 'https';
    const host = req.headers.host;
    
    let baseUrl;
    if (isHttps) {
        baseUrl = `https://${host}`;
    } else {
        baseUrl = `http://${host}`;
        // Force HTTPS for production environments
        if (!host.startsWith('localhost') && !baseUrl.startsWith('https://')) {
            baseUrl = `https://${host}`;
        }
    }
    
    const stremioUrl = `stremio://${host}/manifest.json`;
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Installazione Vavoo.to Italia Addon</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; }
        </style>
    </head>
    <body>
        <h1>Vavoo.to Italia Addon per Stremio</h1>
        <p>Per installare l'addon, clicca sul pulsante qui sotto:</p>
        <a class="button" href="${stremioUrl}">Installa su Stremio</a>
        <p>Oppure aggiungi manualmente questo URL in Stremio:</p>
        <code>${baseUrl}/manifest.json</code>
    </body>
    </html>
    `;
    
    res.send(html);
});

// Root redirects to install page
app.get('/', (req, res) => {
    res.redirect('/install');
});

// Catch-all route
app.get('*', (req, res) => {
    res.redirect('/install');
});

// Utilizza il router fornito da serveHTTP invece di addon.getHTTPRouter()
const router = serveHTTP(addon);
app.use('/', router);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Vavoo.to Italy addon running on port ${PORT}`);
});
