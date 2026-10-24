// Proxy DAE : Overpass (defibrillateurs) + Nominatim (geocodage adresse)
// Budget total strict : la fonction repond TOUJOURS en < 9 s
const OVERPASS_MIRRORS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
];
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// Enveloppe dure : coupe tout au bout de ms, meme si le fetch interne hang
function hardTimeout(ms, promise) {
    return Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { lat, lon, radius, address } = req.query;

    // ---- Mode geocodage : adresse -> coordonnees ----
    if (address) {
        try {
            const url = NOMINATIM + '?q=' + encodeURIComponent(String(address).slice(0, 200)) + '&format=json&limit=1&countrycodes=fr';
            const geo = await hardTimeout(6000, fetch(url, {
                headers: { 'User-Agent': 'cotation-medecin/1.0 (medical emergency app)' }
            }));
            if (!geo.ok) throw new Error('bad status');
            const places = await geo.json();
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.status(200).json({ geocode: places.length > 0 ? places[0] : null });
        } catch (e) {
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).json({ geocode: null, error: 'Geocodage momentanement indisponible, reessayez' });
        }
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
    const query = `[out:json][timeout:8];(node["emergency"="defibrillator"](around:${r},${la},${lo}););out body 60;`;

    const deadline = Date.now() + 8000; // budget total 8 s
    for (const base of OVERPASS_MIRRORS) {
        const left = deadline - Date.now();
        if (left < 1500) break;
        try {
            const upstream = await hardTimeout(Math.min(left, 6000), fetch(base, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'cotation-medecin/1.0 (medical emergency app)'
                },
                body: 'data=' + encodeURIComponent(query)
            }));
            if (upstream.ok) {
                const data = await hardTimeout(2000, upstream.json());
                if (data && Array.isArray(data.elements)) {
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                    res.status(200).json(data);
                    return;
                }
            }
        } catch (e) { /* miroir suivant */ }
    }
    // Toujours une reponse rapide, jamais de hang
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ elements: [], unavailable: true, error: 'Service de cartes momentanement indisponible (Overpass), reessayez dans un instant' });
}
