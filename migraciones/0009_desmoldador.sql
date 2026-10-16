-- 0009 · Desmoldador: quien desmoldo cada maquinada.
--
-- Son las mismas personas que los maquinistas (rotan de puesto), asi que se
-- eligen de la misma lista: `estanterias.maquinistas`. Como el maquinista, se
-- guarda id y nombre (snapshot) y las dos columnas son nullable: lo desmoldado
-- antes de esta migracion no tiene dato.

ALTER TABLE estanterias.tandas ADD COLUMN IF NOT EXISTS desmoldador_id integer REFERENCES estanterias.maquinistas (id);
ALTER TABLE estanterias.tandas ADD COLUMN IF NOT EXISTS desmoldador_nombre text;
