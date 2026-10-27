-- 0018 · Productos en par (la Irregular).
--
-- Algunos productos usan dos modelos de molde complementarios (Irregular 1 e
-- Irregular 2): el trompo llena una estanteria de cada uno con el mismo
-- paston, y cada lado da sus propios paquetes. Se entregan siempre de a
-- juegos (tantos del 1 como del 2).
--
-- Es UN producto ("Irregular Gris") con dos modelos: `modelo_id` es el primer
-- lado y `modelo_par_id` el segundo. Cada llenado crea dos tandas, una por
-- estanteria y con su tarjeta, que valen media maquinada cada una (`peso`) y
-- se apuntan entre si (`par_tanda_id`). Las tandas de siempre pesan 1.

ALTER TABLE estanterias.productos
  ADD COLUMN IF NOT EXISTS modelo_par_id integer REFERENCES estanterias.modelos(id);

ALTER TABLE estanterias.tandas
  ADD COLUMN IF NOT EXISTS peso numeric(3, 1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS par_tanda_id integer REFERENCES estanterias.tandas(id);

DO $$ BEGIN
  ALTER TABLE estanterias.productos
    ADD CONSTRAINT productos_par_distinto CHECK (modelo_par_id IS NULL OR modelo_par_id <> modelo_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE estanterias.tandas
    ADD CONSTRAINT tandas_peso_valido CHECK (peso IN (0.5, 1));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
