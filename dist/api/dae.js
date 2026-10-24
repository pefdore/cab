// Proxy Overpass pour le chercheur de DAE (evite le blocage CORS cote navigateur)
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
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
        const upstream = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(query)
        });
        if (!upstream.ok) {
            res.status(502).json({ error: 'Overpass indisponible' });
            return;
        }
        const data = await upstream.json();
        res.status(200).json(data);
    } catch (e) {
        res.status(502).json({ error: 'Erreur proxy DAE' });
    }
}
