-- 0015 · Grupos de color.
--
-- No todos los grises (ni todos los beiges) son iguales: cada grupo es una
-- misma formula de color. Producir seguido lo del mismo grupo evita lavar el
-- trompo entre maquinadas. Ej: Liston Gris y Uhma Gris comparten grupo; Green
-- Deck Liso y Green Deck Pino son otro gris.
--
-- No es lo mismo que la familia: la familia dice con que estanterias se puede
-- llenar (moldes); el grupo de color dice que mezcla lleva.

CREATE TABLE IF NOT EXISTS estanterias.grupos_color (
  id serial PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  nota text,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true
);

ALTER TABLE estanterias.productos
  ADD COLUMN IF NOT EXISTS grupo_color_id integer REFERENCES estanterias.grupos_color(id);
