// Proxy DAE : Overpass (defibrillateurs) + Nominatim (geocodage adresse)
// Evite le blocage CORS cote navigateur, bascule entre miroirs
const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
];
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

async function fetchWithTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
        clearTimeout(t);
    }
}

async function tryMirror(base, query) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const upstream = await fetchWithTimeout(base, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'cotation-medecin/1.0 (medical emergency app)'
                },
                body: 'data=' + encodeURIComponent(query)
            }, 20000);
            if (upstream.ok) {
                return await upstream.json();
            }
            if (upstream.status === 429) {
                await new Promise(r => setTimeout(r, 3000));
            }
        } catch (e) {
            if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
        }
    }
    return null;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        const { lat, lon, radius, address } = req.query;

        // ---- Mode geocodage : adresse -> coordonnees ----
        if (address) {
            const url = NOMINATIM + '?q=' + encodeURIComponent(String(address).slice(0, 200)) + '&format=json&limit=1&countrycodes=fr';
            const geo = await fetchWithTimeout(url, {
                headers: { 'User-Agent': 'cotation-medecin/1.0 (medical emergency app)' }
            }, 15000);
            if (!geo.ok) {
                res.setHeader('Cache-Control', 'no-store');
                res.status(502).json({ error: 'Geocodage indisponible' });
                return;
            }
            const places = await geo.json();
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.status(200).json({ geocode: places.length > 0 ? places[0] : null });
            return;
        }

        // ---- Mode recherche DAE autour d'un point ----
        const la = parseFloat(lat);
        const lo = parseFloat(lon);
        const r = Math.min(Math.max(parseInt(radius, 10) || 2000, 100), 50000);
        if (isNaN(la) || isNaN(lo)) {
            res.status(400).json({ error: 'Parametres lat/lon ou address requis' });
            return;
        }
        const query = `[out:json][timeout:25];(node["emergency"="defibrillator"](around:${r},${la},${lo}););out body 60;`;

        for (const base of OVERPASS_MIRRORS) {
            const data = await tryMirror(base, query);
            if (data && Array.isArray(data.elements)) {
                res.setHeader('Cache-Control', 'public, max-age=3600');
                res.status(200).json(data);
                return;
            }
        }
        res.setHeader('Cache-Control', 'no-store');
        res.status(502).json({ error: 'Service de cartes momentanement indisponible, reessayez' });
    } catch (e) {
        res.status(502).json({ error: 'Erreur proxy DAE' });
    }
}
