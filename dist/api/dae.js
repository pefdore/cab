// Chercheur de DAE — sources officielles 100% gouvernementales :
//   - BAN (api-adresse.data.gouv.fr) : geocodage adresse + reverse (lat/lon -> CP)
//   - geo.api.gouv.fr : communes du departement avec centre -> communes voisines
//   - Géo'DAE (tabular-api.data.gouv.fr, Ministere de la Sante) : base nationale des DAE
// Budget total strict : reponse TOUJOURS en < 9 s.

const GEODAE_RESOURCE = 'edb6a9e1-2f16-4bbf-99e7-c3eb6b90794c';
const TABULAR = 'https://tabular-api.data.gouv.fr/api/resources/' + GEODAE_RESOURCE + '/data/';
const UA = { 'User-Agent': 'cotation-medecin/1.0 (medical emergency app)' };

function hardTimeout(ms, promise) {
    return Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
}

function havKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

// Geocodage : adresse OU position -> { lat, lon, label, cp, dep }
async function locate(query) {
    // mode adresse
    if (query.address) {
        const url = 'https://api-adresse.data.gouv.fr/search/?q=' + encodeURIComponent(query.address) + '&limit=1';
        const r = await hardTimeout(6000, fetch(url, { headers: UA }));
        if (!r.ok) throw new Error('geocodage');
        const d = await r.json();
        const f = d.features && d.features[0];
        if (!f) return null;
        return {
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            label: f.properties.label,
            cp: f.properties.postcode,
            city: f.properties.city,
            dep: f.properties.citycode ? f.properties.citycode.slice(0, 2) : null
        };
    }
    // mode reverse (lat/lon -> adresse + CP)
    const url = 'https://api-adresse.data.gouv.fr/reverse/?lat=' + query.lat + '&lon=' + query.lon;
    const r = await hardTimeout(6000, fetch(url, { headers: UA }));
    if (!r.ok) throw new Error('reverse');
    const d = await r.json();
    const f = d.features && d.features[0];
    if (!f) return { lat: query.lat, lon: query.lon, label: 'votre position', cp: null, dep: null };
    return {
        lat: query.lat,
        lon: query.lon,
        label: f.properties.label,
        cp: f.properties.postcode,
        city: f.properties.city,
        dep: f.properties.citycode ? f.properties.citycode.slice(0, 2) : null
    };
}

// Communes du departement dans un rayon -> liste de codes postaux
async function nearbyCps(lat, lon, dep, radiusKm) {
    if (!dep) return [];
    try {
        const r = await hardTimeout(6000, fetch(
            'https://geo.api.gouv.fr/departements/' + dep + '/communes?format=json&fields=nom,codesPostaux,centre',
            { headers: UA }
        ));
        if (!r.ok) return [];
        const communes = await r.json();
        const near = communes.filter(c => c.centre &&
            havKm(lat, lon, c.centre.coordinates[1], c.centre.coordinates[0]) <= radiusKm + 5);
        return [...new Set(near.flatMap(c => c.codesPostaux || []))];
    } catch (e) {
        return [];
    }
}

// DAE officiels Géo'DAE pour une liste de CP
async function fetchGeodae(cps) {
    const url = TABULAR + '?page_size=200&c_com_cp__in=(' + cps.join(',') + ')';
    const r = await hardTimeout(8000, fetch(url, { headers: UA }));
    if (!r.ok) throw new Error('geodae');
    const d = await r.json();
    return (d.data || []).map(row => ({
        lat: row.c_lat_coor1,
        lon: row.c_long_coor1,
        name: row.c_nom || null,
        addr: [row.c_adr_num, row.c_adr_voie].filter(Boolean).join(' ') || null,
        city: row.c_com_nom || null,
        cp: row.c_com_cp || null,
        access: row.c_acc || null,               // Interieur / Exterieur
        accessComplt: row.c_acc_complt || null,  // precision d'acces
        hours: row.c_dispo_horaires || null,     // horaires
        state: row.c_etat_fonct || null          // en fonctionnement ?
    })).filter(d => d.lat && d.lon);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { lat, lon, radius, address } = req.query;

    try {
        // ---- Mode geocodage seul (adresse -> point) ----
        if (address && !lat) {
            const loc = await locate({ address: String(address).slice(0, 200) });
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.status(200).json({ geocode: loc });
            return;
        }

        // ---- Mode recherche DAE ----
        let loc;
        if (address) {
            loc = await locate({ address: String(address).slice(0, 200) });
            if (!loc) {
                res.status(200).json({ elements: [], error: 'Adresse introuvable' });
                return;
            }
        } else {
            const la = parseFloat(lat);
            const lo = parseFloat(lon);
            if (isNaN(la) || isNaN(lo)) {
                res.status(400).json({ error: 'Parametres lat/lon ou address requis' });
                return;
            }
            loc = await locate({ lat: la, lon: lo });
        }

        const radiusKm = Math.min(Math.max(parseFloat(radius) / 1000 || 5, 1), 25);
        const searchCps = loc.cp ? [loc.cp] : [];
        if (loc.dep) {
            const near = await nearbyCps(loc.lat, loc.lon, loc.dep, radiusKm);
            for (const cp of near) if (!searchCps.includes(cp)) searchCps.push(cp);
        }
        // CP du point en priorite + voisins
        const cps = searchCps.slice(0, 60);
        if (cps.length === 0) {
            res.status(200).json({ elements: [], unavailable: true, error: 'Position hors France ou code postal introuvable' });
            return;
        }

        const daes = await fetchGeodae(cps);
        // tri par distance reelle
        daes.forEach(d => { d.dist = havKm(loc.lat, loc.lon, d.lat, d.lon); });
        const inRange = daes.filter(d => d.dist <= radiusKm + 2);
        const list = (inRange.length > 0 ? inRange : daes).sort((a, b) => a.dist - b.dist).slice(0, 30);

        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.status(200).json({
            elements: list,
            origin: { lat: loc.lat, lon: loc.lon, label: loc.label, cp: loc.cp, city: loc.city },
            source: 'GeoDAE - base nationale des defibrillateurs (Ministere de la Sante)'
        });
    } catch (e) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({ elements: [], unavailable: true, error: 'Service momentanement indisponible, reessayez' });
    }
}
