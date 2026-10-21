-- 0016 · Trompo de cada linea de llenado del programa.
--
-- Los lavados del trompo se cuentan por trompo: cada cambio de grupo de color
-- dentro de un mismo trompo es un lavado de mas. Todo va al trompo por defecto
-- (NULL = el por defecto); se puede pasar una linea al otro trompo.

ALTER TABLE estanterias.programa_lineas
  ADD COLUMN IF NOT EXISTS trompo estanterias.trompo;
