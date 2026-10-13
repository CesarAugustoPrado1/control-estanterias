-- 0007 · Maquinistas: quien maneja el trompo en cada llenado.
--
-- El maquinista no es usuario de la app: no entra, no tiene PIN. El operario
-- que registra el llenado lo elige de una lista que carga el admin en
-- Parametros. Se da de baja con `activo`, nunca se borra: las tandas viejas lo
-- siguen nombrando.
--
-- La tanda guarda id y nombre (snapshot), igual que el producto: si mañana se
-- corrige el nombre, el historial sigue diciendo lo que decia. Las dos columnas
-- son nullable porque las tandas anteriores a esta migracion no tienen.

CREATE TABLE IF NOT EXISTS estanterias.maquinistas (
  id     serial PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS maquinistas_nombre_idx ON estanterias.maquinistas (nombre);

ALTER TABLE estanterias.tandas ADD COLUMN IF NOT EXISTS maquinista_id integer REFERENCES estanterias.maquinistas (id);
ALTER TABLE estanterias.tandas ADD COLUMN IF NOT EXISTS maquinista_nombre text;
