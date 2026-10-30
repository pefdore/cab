-- ============================================================
-- FIX INSCRIPTION : rattachement cabinet + demande de validation
-- 100% cote serveur (plus aucune dependance au client)
-- ============================================================
-- CONTEXTE DU BUG : au signup, la creation du cabinet et les updates
-- de profiles etaient faites par le CLIENT apres auth.signUp(). Si la
-- confirmation d'email etait activee, aucune session n'existait encore :
-- toutes ces ecritures echouaient silencieusement (RLS/anon) => le
-- medecin n'etait rattache a AUCUN cabinet et AUCUNE demande pending
-- n'etait creee (le trigger sec_ensure_join_request ne se declenchait
-- jamais, faute d'update reussi sur profiles).
--
-- CORRECTION : un trigger sur auth.users (handle_new_user) cree le
-- profil ET gere le cabinet des l'inscription, quel que soit l'etat de
-- la session :
--   - medecin_installe FONDATEUR (pas de cabinet choisi dans la modale)
--     => creation du cabinet + rattachement direct
--   - medecin_installe qui REJOINT un cabinet (id choisi dans la modale)
--     => cabinet_address + pending_cabinet_id poses, AUCUN cabinet_id :
--        la demande pending est creee par le trigger existant
--   - secretaire => idem rejoindre : demande pending obligatoire
--
-- A EXECUTER DANS L'EDITEUR SQL DE SUPABASE.
-- ============================================================

-- 0) Colonnes techniques
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pending_cabinet_id UUID REFERENCES cabinets(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS remplace_medecin_id UUID;

-- 1) Resolution du cabinet cible : privilegier l'id EXACT choisi dans
--    la modale (pending_cabinet_id) avant la resolution par adresse.
CREATE OR REPLACE FUNCTION public.sec_resolve_target_cabinet(p_profile record)
RETURNS UUID AS $$
DECLARE
    v_cabinet UUID;
    v_exists BOOLEAN;
BEGIN
    -- 0) id exact choisi par l'utilisateur dans la modale « rejoindre »
    IF p_profile.pending_cabinet_id IS NOT NULL THEN
        SELECT EXISTS (SELECT 1 FROM cabinets c WHERE c.id = p_profile.pending_cabinet_id)
          INTO v_exists;
        IF v_exists THEN
            RETURN p_profile.pending_cabinet_id;
        END IF;
    END IF;

    -- 1) cabinet_id direct (deja rattache : hors trigger de demande)
    IF p_profile.cabinet_id IS NOT NULL THEN
        SELECT EXISTS (SELECT 1 FROM cabinets c WHERE c.id = p_profile.cabinet_id)
          INTO v_exists;
        IF v_exists THEN
            RETURN p_profile.cabinet_id;
        END IF;
    END IF;

    -- 2) resolution par adresse : cabinet avec des medecins associes d'abord
    IF p_profile.cabinet_address IS NOT NULL THEN
        SELECT c.id INTO v_cabinet
        FROM cabinets c
        WHERE c.address ILIKE '%' || p_profile.cabinet_address || '%'
        ORDER BY (
            SELECT count(*) FROM profiles m
            WHERE m.cabinet_id = c.id AND m.role = 'medecin_installe'
        ) DESC, c.created_at ASC
        LIMIT 1;
        RETURN v_cabinet;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2) Creation du profil + gestion du cabinet au signup (cote serveur)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_first TEXT;
    v_last TEXT;
    v_addr TEXT;
    v_cabinet_id UUID;
    v_new_cabinet UUID;
    v_name TEXT;
    v_meta TEXT;
BEGIN
    v_role  := COALESCE(NEW.raw_user_meta_data->>'role', 'medecin_installe');
    v_first := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
    v_last  := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
    v_addr  := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'cabinet_address', '')), '');
    v_name  := trim(v_first || ' ' || v_last);

    -- Cabinet choisi via la modale « rejoindre un cabinet » (id exact)
    v_meta := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'cabinet_id', '')), '');
    IF v_meta IS NOT NULL THEN
        BEGIN
            v_cabinet_id := v_meta::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_cabinet_id := NULL;
        END;
        IF v_cabinet_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM cabinets c WHERE c.id = v_cabinet_id
        ) THEN
            v_cabinet_id := NULL;
        END IF;
    END IF;

    ---------------------------------------------------------------
    -- Cas 1 : medecin installé FONDATEUR (adresse fournie, aucun
    -- cabinet choisi) => creation du cabinet PUIS rattachement direct.
    -- Le cabinet est cree AVANT l'insert du profil pour que le trigger
    -- sec_ensure_join_request voie cabinet_id NON NULL et ne cree pas
    -- de demande pour le fondateur.
    ---------------------------------------------------------------
    IF v_role = 'medecin_installe' AND v_addr IS NOT NULL AND v_cabinet_id IS NULL THEN
        INSERT INTO cabinets (address, name)
        VALUES (v_addr, COALESCE(NULLIF(v_name, ''), 'Cabinet'))
        RETURNING id INTO v_new_cabinet;

        INSERT INTO profiles (id, email, first_name, last_name, role,
                              remplace_medecin_id, cabinet_id, cabinet_address)
        VALUES (NEW.id, NEW.email,
                NULLIF(v_first, ''), NULLIF(v_last, ''), v_role,
                NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'remplace_medecin_id', '')), '')::UUID,
                v_new_cabinet, v_addr)
        ON CONFLICT (id) DO UPDATE SET
            cabinet_id      = COALESCE(profiles.cabinet_id, EXCLUDED.cabinet_id),
            cabinet_address = COALESCE(profiles.cabinet_address, EXCLUDED.cabinet_address);
        RETURN NEW;
    END IF;

    ---------------------------------------------------------------
    -- Cas 2 : rejoindre un cabinet (medecin via modale, ou secretaire)
    -- => AUCUN cabinet_id : la demande pending sera creee par le
    -- trigger existant sec_ensure_join_request (resolution par
    -- pending_cabinet_id puis par adresse).
    ---------------------------------------------------------------
    INSERT INTO profiles (id, email, first_name, last_name, role,
                          remplace_medecin_id, cabinet_address, pending_cabinet_id)
    VALUES (NEW.id, NEW.email,
            NULLIF(v_first, ''), NULLIF(v_last, ''), v_role,
            NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'remplace_medecin_id', '')), '')::UUID,
            v_addr, v_cabinet_id)
    ON CONFLICT (id) DO UPDATE SET
        first_name        = COALESCE(NULLIF(profiles.first_name, ''), EXCLUDED.first_name),
        last_name         = COALESCE(NULLIF(profiles.last_name, ''), EXCLUDED.last_name),
        cabinet_address   = COALESCE(profiles.cabinet_address, EXCLUDED.cabinet_address),
        pending_cabinet_id = COALESCE(profiles.pending_cabinet_id, EXCLUDED.pending_cabinet_id);

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] erreur ignoree: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- BACKFILL : corriger les inscriptions deja cassees
-- (medecins/secretaires inscrits via l'ancien flux client, jamais
-- rattaches et sans demande pending)
-- ============================================================

-- a) Reprendre l'adresse et le cabinet choisis depuis les metadata
--    d'inscription (jamais arrives dans profiles a l'epoque).
UPDATE profiles p
SET cabinet_address    = NULLIF(trim(u.raw_user_meta_data->>'cabinet_address'), ''),
    pending_cabinet_id = NULLIF(trim(u.raw_user_meta_data->>'cabinet_id'), '')::UUID
FROM auth.users u
WHERE u.id = p.id
  AND p.cabinet_id IS NULL
  AND p.cabinet_address IS NULL
  AND NULLIF(trim(u.raw_user_meta_data->>'cabinet_address'), '') IS NOT NULL;

-- b) Creer la demande pending manquante : le simple UPDATE de
--    cabinet_address declenche sec_ensure_join_request, qui cree la
--    demande (id exact privilegie, sinon resolution par adresse).
UPDATE profiles p
SET cabinet_address = p.cabinet_address
WHERE p.cabinet_id IS NULL
  AND p.cabinet_address IS NOT NULL
  AND p.role IN ('secretaire', 'medecin_installe')
  AND NOT EXISTS (
      SELECT 1 FROM cabinet_join_requests r
      WHERE r.requester_id = p.id
  );

-- c) Verifier
-- SELECT p.first_name, p.last_name, p.email, p.cabinet_id, p.cabinet_address,
--        r.status AS demande
-- FROM profiles p
-- LEFT JOIN cabinet_join_requests r ON r.requester_id = p.id
-- WHERE p.role IN ('secretaire','medecin_installe')
-- ORDER BY p.created_at DESC;
