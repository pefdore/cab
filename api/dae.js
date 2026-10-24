// Proxy Overpass pour le chercheur de DAE (evite le blocage CORS cote navigateur)
// Bascule automatique entre miroirs Overpass, 2 tentatives par miroir
const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
];

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
    // 2 tentatives par miroir (la 1re echoue parfois : DNS/TLS froid)
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
        const { lat, lon, radius } = req.query;
        const la = parseFloat(lat);
        const lo = parseFloat(lon);
        const r = Math.min(Math.max(parseInt(radius, 10) || 2000, 100), 50000);
        if (isNaN(la) || isNaN(lo)) {
            res.status(400).json({ error: 'Parametres lat/lon requis' });
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
