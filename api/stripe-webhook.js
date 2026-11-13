// Cabix.io — Webhook Stripe : active, renouvelle et clôt l'abonnement cabinet.
// Sans dépendance : vérification de signature Stripe en crypto natif,
// écriture dans Supabase via la clé service (RLS ignorée).
//
// Événements gérés :
//   checkout.session.completed      -> passage en "active" + période en cours
//   invoice.paid                    -> renouvellement (current_period_end +1 période)
//   invoice.payment_failed          -> passage en "past_due"
//   customer.subscription.deleted   -> passage en "canceled"

import crypto from 'crypto';

let SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/^"|"$/g, '');
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
    SUPABASE_URL = 'https://wlpbnxnvctlmhndqvvim.supabase.co';
}
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function json(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
}

function verifyStripeSignature(payload, sigHeader, secret) {
    if (!sigHeader || !secret) return false;
    const parts = Object.fromEntries(
        sigHeader.split(',').map(kv => kv.split('=').map(s => s.trim()))
    );
    const t = parts.t;
    const v1 = parts.v1;
    if (!t || !v1) return false;
    const expected = crypto.createHmac('sha256', secret)
        .update(t + '.' + payload)
        .digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
    } catch (e) {
        return false;
    }
}

async function supabaseUpdate(table, query, patch) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
        method: 'PATCH',
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(patch)
    });
    return r.ok;
}

async function supabaseInsert(table, row) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
        method: 'POST',
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(row)
    });
    return r.ok;
}

function periodEnd(interval, from) {
    const d = new Date(from);
    if (interval === 'monthly') d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    if (!SERVICE_KEY || !WEBHOOK_SECRET) return json(res, 500, { error: 'config_manquante' });

    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const sig = req.headers['stripe-signature'];
    if (!verifyStripeSignature(rawBody, sig, WEBHOOK_SECRET)) {
        return json(res, 400, { error: 'signature_invalide' });
    }

    let event;
    try { event = JSON.parse(rawBody); } catch (e) { return json(res, 400, { error: 'payload_invalide' }); }

    // Idempotence : ignorer un événement déjà traité
    try {
        const inserted = await supabaseInsert('payment_events', {
            stripe_event_id: event.id,
            event_type: event.type,
            payload: event.data
        });
        if (!inserted) return json(res, 200, { ignored: 'evenement_deja_traite' });
    } catch (e) { /* on continue : le traitement reste idempotent par cabinet */ }

    if (event.type === 'checkout.session.completed') {
        const s = event.data.object;
        const cabinetId = s.metadata?.cabinet_id || s.client_reference_id;
        const plan = s.metadata?.plan || 'solo';
        const interval = s.metadata?.interval || 'yearly';
        if (cabinetId) {
            await supabaseUpdate('cabinet_subscriptions',
                'cabinet_id=eq.' + encodeURIComponent(cabinetId), {
                    plan,
                    billing_interval: interval,
                    status: 'active',
                    current_period_end: periodEnd(interval, Date.now()),
                    stripe_customer_id: s.customer || null,
                    stripe_subscription_id: s.subscription || null,
                    updated_at: new Date().toISOString()
                });
        }
    } else if (event.type === 'invoice.paid') {
        const inv = event.data.object;
        const subId = inv.subscription;
        const lines = inv.lines?.data || [];
        const meta = lines[0]?.metadata || {};
        const cabinetId = meta.cabinet_id;
        const plan = meta.plan || null;
        const interval = meta.interval || inv.lines?.data?.[0]?.price?.recurring?.interval === 'month'
            ? 'monthly' : 'yearly';

        // Enregistrer la facture (PDF Stripe) pour le cabinet — idempotent
        if (cabinetId && inv.id) {
            try {
                await supabaseInsert('subscription_invoices', {
                    cabinet_id: cabinetId,
                    stripe_invoice_id: inv.id,
                    amount_cents: inv.amount_paid || inv.amount_due,
                    currency: inv.currency || 'eur',
                    plan,
                    billing_interval: interval,
                    pdf_url: inv.invoice_pdf || null,
                    hosted_url: inv.hosted_invoice_url || null,
                    paid_at: inv.status_transitions && inv.status_transitions.paid_at
                        ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
                        : new Date().toISOString()
                });
            } catch (e) { /* ignoré : idempotence par stripe_invoice_id */ }
        }
        if (cabinetId) {
            await supabaseUpdate('cabinet_subscriptions',
                'cabinet_id=eq.' + encodeURIComponent(cabinetId), {
                    status: 'active',
                    current_period_end: periodEnd(interval, Date.now()),
                    updated_at: new Date().toISOString()
                });
        } else if (subId) {
            await supabaseUpdate('cabinet_subscriptions',
                'stripe_subscription_id=eq.' + encodeURIComponent(subId), {
                    status: 'active',
                    current_period_end: periodEnd(interval, Date.now()),
                    updated_at: new Date().toISOString()
                });
        }
    } else if (event.type === 'invoice.payment_failed') {
        const inv = event.data.object;
        const subId = inv.subscription;
        if (subId) {
            await supabaseUpdate('cabinet_subscriptions',
                'stripe_subscription_id=eq.' + encodeURIComponent(subId), {
                    status: 'past_due',
                    updated_at: new Date().toISOString()
                });
        }
    } else if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        if (sub.id) {
            await supabaseUpdate('cabinet_subscriptions',
                'stripe_subscription_id=eq.' + encodeURIComponent(sub.id), {
                    status: 'canceled',
                    updated_at: new Date().toISOString()
                });
        }
    }

    return json(res, 200, { received: true });
}
