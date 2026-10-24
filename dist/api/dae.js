// Proxy Overpass pour le chercheur de DAE (evite le blocage CORS cote navigateur)
// Bascule automatique entre miroirs Overpass en cas d'indisponibilite
const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
];

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
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

        let lastErr = null;
        for (const base of OVERPASS_MIRRORS) {
            try {
                const upstream = await fetch(base, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'cotation-medecin/1.0 (medical emergency app)'
                    },
                    body: 'data=' + encodeURIComponent(query)
                });
                if (upstream.ok) {
                    const data = await upstream.json();
                    res.status(200).json(data);
                    return;
                }
                lastErr = new Error(base + ' -> ' + upstream.status);
            } catch (e) {
                lastErr = e;
            }
        }
        res.status(502).json({ error: 'Overpass indisponible', detail: String(lastErr && lastErr.message || lastErr) });
    } catch (e) {
        res.status(502).json({ error: 'Erreur proxy DAE' });
    }
}
