-- Requêtes pour corriger l'affiliation des médecins aux cabinets

-- 1. Mettre à jour Dr DORE pour qu'il soit affilié à son cabinet
UPDATE profiles 
SET cabinet_id = (SELECT id FROM cabinets WHERE name LIKE '%DORE%' LIMIT 1)
WHERE id = 'fa155f5d-8dbb-4f76-885a-39a1095e1e8b';

-- 2. Mettre à jour le nouvel utilisateur
-- Trouve d'abord l'ID du cabinet
SELECT id, address, name FROM cabinets;

-- Puis met à jour le profil (remplace 'ID_DU_CABINET' par l'ID trouvé)
UPDATE profiles 
SET cabinet_id = 'ID_DU_CABINET'
WHERE email = 'alt.t2-1zdfnmd@yopmail.com';

-- 3. Vérifier les résultats
SELECT p.first_name, p.last_name, p.email, p.cabinet_id, c.name as cabinet_name
FROM profiles p 
LEFT JOIN cabinets c ON p.cabinet_id = c.id
WHERE p.cabinet_id IS NOT NULL;