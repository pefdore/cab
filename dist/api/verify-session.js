// Cabix.io — Vérification d'un paiement au retour de Stripe Checkout.
// Filet de sécurité indépendant du webhook : quand la page paiement.html
// revient avec ?success=1&session_id=..., elle demande ici de confirmer
// la session et d'activer l'abonnement du cabinet.
//
// POST { session_id, supabase_access_token }

function json(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

        const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        let SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/^"|"$/g, '');
        if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
            SUPABASE_URL = 'https://wlpbnxnvctlmhndqvvim.supabase.co';
        }
        if (!STRIPE_KEY || !SERVICE_KEY) {
            return json(res, 500, { error: 'config_manquante' });
        }

        let payload = {};
        try { payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) {}
        const { session_id, supabase_access_token } = payload;
        if (!session_id || !supabase_access_token) return json(res, 400, { error: 'parametres_manquants' });

        // Authentification de l'appelant
        const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
            headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + supabase_access_token }
        });
        if (!userRes.ok) return json(res, 401, { error: 'jeton_invalide' });
        const user = await userRes.json();

        // Session Stripe
        const sRes = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(session_id), {
            headers: { 'Authorization': 'Bearer ' + STRIPE_KEY }
        });
        const session = await sRes.json();
        if (!sRes.ok) return json(res, 404, { error: 'session_introuvable', details: session.error && session.error.message });

        const paid = session.status === 'complete' &&
            (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
        if (!paid) return json(res, 200, { activated: false, status: session.payment_status });

        const cabinetId = (session.metadata && session.metadata.cabinet_id) || session.client_reference_id;
        if (!cabinetId) return json(res, 400, { error: 'cabinet_inconnu' });

        // L'appelant doit être membre du cabinet concerné
        const profRes = await fetch(SUPABASE_URL + '/rest/v1/profiles?select=id&cabinet_id=eq.' + encodeURIComponent(cabinetId), {
            headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
        });
        const profiles = await profRes.json();
        const isMember = Array.isArray(profiles) && profiles.some(p => p.id === user.id);
        if (!isMember) return json(res, 403, { error: 'pas_membre_du_cabinet' });

        // Activation (même logique que le webhook checkout.session.completed)
        const plan = (session.metadata && session.metadata.plan) || 'solo';
        const interval = (session.metadata && session.metadata.interval) || 'yearly';
        const now = new Date();
        const end = new Date(now);
        if (interval === 'monthly') end.setMonth(end.getMonth() + 1);
        else end.setFullYear(end.getFullYear() + 1);

        const patchRes = await fetch(SUPABASE_URL + '/rest/v1/cabinet_subscriptions?cabinet_id=eq.' + encodeURIComponent(cabinetId), {
            method: 'PATCH',
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': 'Bearer ' + SERVICE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                plan,
                billing_interval: interval,
                status: 'active',
                current_period_end: end.toISOString(),
                stripe_customer_id: session.customer || null,
                stripe_subscription_id: session.subscription || null,
                updated_at: now.toISOString()
            })
        });
        if (!patchRes.ok) {
            const err = await patchRes.text();
            return json(res, 500, { error: 'activation_echouee', details: err.slice(0, 300) });
        }

        return json(res, 200, { activated: true, plan, interval });
    } catch (e) {
        return json(res, 500, { error: 'serveur', details: e && e.message ? e.message : String(e) });
    }
}
