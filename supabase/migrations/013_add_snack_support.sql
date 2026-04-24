-- 013_add_snack_support.sql
-- Adds 'snack_sugerido' to calendario.origen constraint
-- Tags ~10 alimentos with 'Snack' in rol_permitido (1 per duplicate group)

-- 1. Expand origen constraint to accept 'snack_sugerido'
ALTER TABLE calendario DROP CONSTRAINT origen_valido;
ALTER TABLE calendario ADD CONSTRAINT origen_valido
  CHECK (origen = ANY (ARRAY['generado','chat','coach','sugerencia','snack_sugerido']));

-- 2. Tag snack-apt alimentos with 'Snack' in rol_permitido
-- One per duplicate group, prioritizing the record with foto_url and best data

-- Yogur Griego (014c24d7 — has foto, porcion_base=150g)
UPDATE alimentos SET rol_permitido = array_append(rol_permitido, 'Snack')
WHERE id = '014c24d7-ff49-4070-8b96-75a108aa5af3' AND NOT ('Snack' = ANY(rol_permitido));

-- Atun enlatado (9680dea4 — has foto, good portions)
UPDATE alimentos SET rol_permitido = array_append(rol_permitido, 'Snack')
WHERE id = '9680dea4-92bf-458f-8cb6-a2f6838ee143' AND NOT ('Snack' = ANY(rol_permitido));

-- Almendras (57acc8e1 — has foto)
UPDATE alimentos SET rol_permitido = array_append(rol_permitido, 'Snack')
WHERE id = '57acc8e1-630a-4054-ab95-a894e477f132' AND NOT ('Snack' = ANY(rol_permitido));

-- Queso Cottage (35f0c2da — has foto)
UPDATE alimentos SET rol_permitido = array_append(rol_permitido, 'Snack')
WHERE id = '35f0c2da-bed6-4d5d-bc02-3dc62b9b6684' AND NOT ('Snack' = ANY(rol_permitido));

-- Huevo (761091c9 — has foto)
UPDATE alimentos SET rol_permitido = array_append(rol_permitido, 'Snack')
WHERE id = '761091c9-459a-4f18-8bd0-59acfea37d74' AND NOT ('Snack' = ANY(rol_permitido));

-- Manzana (32a8d233 — has foto)
UPDATE alimentos SET rol_permitido = array_append(rol_permitido, 'Snack')
WHERE id = '32a8d233-6765-48c6-95d7-fc5251667a02' AND NOT ('Snack' = ANY(rol_permitido));

-- Mantequilla de mani (10bbba52 — no foto, but unique)
UPDATE alimentos SET rol_permitido = array_append(rol_permitido, 'Snack')
WHERE id = '10bbba52-580c-4ef0-b2d2-ce98e1d58d6f' AND NOT ('Snack' = ANY(rol_permitido));

-- Guineo / Banano (18f1c19e — has foto)
UPDATE alimentos SET rol_permitido = array_append(rol_permitido, 'Snack')
WHERE id = '18f1c19e-2d5a-4642-b514-e51840cf5c9d' AND NOT ('Snack' = ANY(rol_permitido));

-- Maní (c5325cff — has foto)
UPDATE alimentos SET rol_permitido = array_append(rol_permitido, 'Snack')
WHERE id = 'c5325cff-0c26-4285-9fd8-672044d59ef7' AND NOT ('Snack' = ANY(rol_permitido));

-- Nueces (5a113d91 — has foto)
UPDATE alimentos SET rol_permitido = array_append(rol_permitido, 'Snack')
WHERE id = '5a113d91-f767-45e3-8e1d-0440cbc77266' AND NOT ('Snack' = ANY(rol_permitido));
