-- 0012 · Tiempo de desmolde de cada producto, en dias.
--
-- Cuantos dias tienen que pasar entre el llenado y el desmolde. Para la mayoria
-- son 2 (lo llenado el lunes se desmolda el miercoles); algunos se desmoldan
-- de un dia para el otro (1). Es una propiedad del producto, editable.
--
-- No bloquea nada: el programa de produccion lo usa para advertir cuando un
-- desmolde se programa antes de tiempo.

ALTER TABLE estanterias.productos
  ADD COLUMN IF NOT EXISTS dias_desmolde integer NOT NULL DEFAULT 2;
