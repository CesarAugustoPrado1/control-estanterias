-- 0005 · El numero de placa es unico por modelo + familia + CEMENTO.
--
-- Hasta ahora el cemento no contaba: una LISTON · BIEGES · 01 de cemento blanco
-- chocaba con la de cemento gris. Pero en planta son grupos de moldes
-- distintos: las de cemento blanco llevan los laterales pintados y su propio
-- cartel, que ahora dice BLANCO (ver `etiquetaPlaca` en lib/tarjetas.ts).
--
-- Idempotente, como las anteriores: se puede volver a correr sin romper nada.
-- Aflojar el indice no puede fallar sobre datos existentes (todo lo que era
-- unico en el trio sigue siendo unico en el cuarteto).

DROP INDEX IF EXISTS estanterias.estanterias_placa_idx;
CREATE UNIQUE INDEX estanterias_placa_idx
  ON estanterias.estanterias (modelo_id, familia_id, cemento, numero);

-- Las tandas que todavia estan en el circuito muestran la placa que guardaron
-- al llenarse. Si la estanteria es de cemento blanco, se les agrega BLANCO para
-- que coincida con el cartel nuevo. El historial cerrado queda como estaba.
UPDATE estanterias.tandas t
SET estanteria_etiqueta = t.estanteria_etiqueta || ' · BLANCO'
FROM estanterias.estanterias e
WHERE e.id = t.estanteria_id
  AND e.cemento = 'blanco'
  AND t.estado IN ('patio', 'horno', 'a_desmoldar')
  AND t.estanteria_etiqueta IS NOT NULL
  AND t.estanteria_etiqueta NOT LIKE '% · BLANCO';
