-- 0011 · Meta de maquinadas por dia y seccion del programa.
--
-- Cuantas maquinadas se quieren hacer ese dia en el trompo y cuantas en
-- desmolde y paletizado. Sirve para armar el programa sin pasarse: la pantalla
-- compara lo programado contra la meta mientras se agregan lineas. Nullable:
-- un dia sin meta funciona como antes.

ALTER TABLE estanterias.programa_dias ADD COLUMN IF NOT EXISTS meta_llenado integer;
ALTER TABLE estanterias.programa_dias ADD COLUMN IF NOT EXISTS meta_desmolde integer;
