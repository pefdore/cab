// Cabix.io — Création d'une session Stripe Checkout pour l'abonnement cabinet.
// Sans dépendance : Stripe et Supabase sont appelés en fetch.
//
// POST { plan, interval, promo_code, email, cabinet_id, supabase_access_token }
// -> { url } (redirection Stripe) ou { redirect } (code full_access activé)

const PLANS = {
    solo:      { label: 'Cabix Solo',      members: '1–2 membres',   monthly: 490,  yearly: 3900 },
    cabinet:   { label: 'Cabix Cabinet',  members: '3–6 membres',   monthly: 1490, yearly: 11900 },
    groupe:    { label: 'Cabix Groupe',    members: '7–15 membres',  monthly: 2990, yearly: 23900 },
    structure: { label: 'Cabix Structure', members: '16–50 membres', monthly: 5990, yearly: 47900 }
};

function json(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
}

async function stripePost(path, params, key) {
    const body = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => body.append(k, String(v)));
    const r = await fetch('https://api.stripe.com/v1/' + path, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Stripe error');
    return data;
}

async function supabaseRpc(fn, body, serviceKey, url) {
    const r = await fetch(url + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: {
            'apikey': serviceKey,
            'Authorization': 'Bearer ' + serviceKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    return { ok: r.ok, data: await r.json() };
}

async function supabaseGet(table, query, serviceKey, url) {
    const r = await fetch(url + '/rest/v1/' + table + '?' + query, {
        headers: {
            'apikey': serviceKey,
            'Authorization': 'Bearer ' + serviceKey
        }
    });
    return { ok: r.ok, data: await r.json() };
}

export default async function handler(req, res) {
  try {
    return await handleCheckout(req, res);
  } catch (e) {
    // Toujours renvoyer du JSON : une erreur brute ferait echouer le
    // r.json() cote client ("Erreur de connexion au paiement") sans
    // donner la vraie cause.
    return json(res, 500, { error: 'serveur', details: e && e.message ? e.message : String(e) });
  }
}

async function handleCheckout(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

    const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    // Nettoyage defensif : coquille dans SUPABASE_URL (espace, guillemet,
    // slash final, http) -> retour au projet par defaut plutot que fetch failed.
    let SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/^"|"$/g, '');
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
        SUPABASE_URL = 'https://wlpbnxnvctlmhndqvvim.supabase.co';
    }
    const SITE_URL = process.env.SITE_URL || 'https://cabix.io';

    if (!SERVICE_KEY) {
        return json(res, 500, { error: 'config_manquante', details: 'SUPABASE_SERVICE_ROLE_KEY requis' });
    }

    let payload = {};
    try { payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) {}
    const { plan, interval = 'yearly', promo_code, email, cabinet_id, billing_mode, billing_name, supabase_access_token } = payload;

    if (!PLANS[plan]) return json(res, 400, { error: 'plan_invalide' });
    if (!['monthly', 'yearly'].includes(interval)) return json(res, 400, { error: 'intervalle_invalide' });

    // Authentification : le jeton Supabase de l'utilisateur doit correspondre
    // à un membre du cabinet visé (l'abonnement est attaché au cabinet).
    if (!supabase_access_token || !cabinet_id) {
        return json(res, 401, { error: 'auth_requise' });
    }
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': 'Bearer ' + supabase_access_token
        }
    });
    if (!userRes.ok) return json(res, 401, { error: 'jeton_invalide' });
    const user = await userRes.json();

    const prof = await supabaseGet('profiles',
        'select=id,cabinet_id&cabinet_id=eq.' + encodeURIComponent(cabinet_id),
        SERVICE_KEY, SUPABASE_URL);
    const isMember = Array.isArray(prof.data) && prof.data.some(p => p.id === user.id);
    if (!isMember) return json(res, 403, { error: 'pas_membre_du_cabinet' });

    // Code promo : validation directe en base, puis activation SQL
    // (full_access / months_free) ou simple réduction (percent_off)
    let percentOff = 0;
    if (promo_code) {
        const codes = await supabaseGet('promo_codes',
            'select=id,type,value,max_uses,times_used,active,expires_at&code=eq.' +
            encodeURIComponent(promo_code.toUpperCase()),
            SERVICE_KEY, SUPABASE_URL);
        const pc = Array.isArray(codes.data) ? codes.data[0] : null;
        const valid = pc && pc.active
            && (!pc.expires_at || new Date(pc.expires_at) > new Date())
            && (pc.max_uses === null || pc.times_used < pc.max_uses);
        if (!valid) return json(res, 400, { error: 'code_invalide' });
        if (pc.type === 'percent_off') {
            percentOff = Number(pc.value) || 0;
        } else {
            const act = await supabaseRpc('cabix_activate_promo',
                { p_cabinet_id: cabinet_id, p_code: promo_code, p_user_id: user.id },
                SERVICE_KEY, SUPABASE_URL);
            if (act.ok && act.data && act.data.ok) {
                return json(res, 200, { redirect: '/paiement.html?promo=active' });
            }
            return json(res, 400, { error: (act.data && act.data.error) || 'code_invalide' });
        }
    }

    // Montant : palier cabinet, réduction éventuelle du code percent_off
    const unit = interval === 'monthly' ? PLANS[plan].monthly : PLANS[plan].yearly;
    const unitAmount = Math.round(unit * (100 - percentOff) / 100);

    // A partir d'ici, un paiement Stripe est necessaire
    if (!STRIPE_KEY) {
        return json(res, 500, { error: 'stripe_non_configure', details: 'STRIPE_SECRET_KEY non définie sur le serveur' });
    }

    // Facturation : cree un client Stripe au nom du cabinet/SCM si demande,
    // sinon la facture est adressee au membre qui regle (email perso).
    let customerId;
    const invoiceName = (billing_mode === 'cabinet' && billing_name) ? billing_name : null;
    if (invoiceName) {
        try {
            const cust = await stripePost('customers', {
                email: email || user.email || undefined,
                name: invoiceName,
                'metadata[cabinet_id]': cabinet_id,
                'metadata[billing_mode]': 'cabinet'
            }, STRIPE_KEY);
            customerId = cust.id;
        } catch (e) {
            // Client non cree : on retombe sur customer_email
        }
    }

    try {
        const session = await stripePost('checkout/sessions', {
            mode: 'subscription',
            ...(customerId ? { customer: customerId } : { customer_email: email || user.email || undefined }),
            client_reference_id: cabinet_id,
            'line_items[0][quantity]': 1,
            'line_items[0][price_data][currency]': 'eur',
            'line_items[0][price_data][unit_amount]': unitAmount,
            'line_items[0][price_data][product_data][name]': PLANS[plan].label + ' — ' + PLANS[plan].members,
            'line_items[0][price_data][recurring][interval]': interval === 'monthly' ? 'month' : 'year',
            // Managed Payments (activé par défaut sur les nouveaux comptes Stripe)
            // exige un tax_code produit ; nos prix sont TTC sans gestion de taxe
            // par Stripe -> désactivé sur la session (option indiquée par Stripe).
            'managed_payments[enabled]': 'false',
            'subscription_data[metadata][cabinet_id]': cabinet_id,
            'subscription_data[metadata][plan]': plan,
            'subscription_data[metadata][interval]': interval,
            'metadata[cabinet_id]': cabinet_id,
            'metadata[plan]': plan,
            'metadata[interval]': interval,
            'metadata[promo_code]': promo_code || '',
            // payment_method_types est deprecie : les moyens de paiement se
            // gerent desormais dans le Dashboard Stripe (Settings > Payment methods).
            success_url: SITE_URL + '/paiement.html?success=1&session_id={CHECKOUT_SESSION_ID}',
            cancel_url: SITE_URL + '/paiement.html?canceled=1'
        }, STRIPE_KEY);

        return json(res, 200, { url: session.url });
    } catch (e) {
        return json(res, 500, { error: 'stripe_error', details: e.message });
    }
}
