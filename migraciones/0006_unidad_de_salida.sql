-- 0006 · Unidad de salida del producto: paquete, unidad o nivel de palet.
--
-- Lo que cuenta empaque no siempre se llama "paquete": del Green Deck liso
-- salen unidades sueltas, y a veces conviene contar por niveles de palet. La
-- cuenta no cambia -`piezas_por_paquete` pasa a leerse como "piezas por unidad
-- de salida"-; cambia el nombre que ve cada pantalla.
--
-- La tanda guarda una copia al llenarse, igual que los factores de conversion:
-- el numero contado y su unidad van juntos, y cambiar la unidad del producto no
-- puede reescribir que significaba un conteo viejo.

DO $$ BEGIN
  CREATE TYPE estanterias.unidad_salida AS ENUM ('paquete', 'unidad', 'nivel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE estanterias.productos ADD COLUMN IF NOT EXISTS unidad estanterias.unidad_salida NOT NULL DEFAULT 'paquete';
ALTER TABLE estanterias.tandas    ADD COLUMN IF NOT EXISTS unidad estanterias.unidad_salida NOT NULL DEFAULT 'paquete';
