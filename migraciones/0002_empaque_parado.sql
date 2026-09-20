-- 0002 · Aviso de "empaque parado" (ARQUITECTURA.md §10.8)
--
-- Cuando se rompe el tunel o se corta la luz, los palets ya desmoldados esperan
-- uno o dos dias. Sin esto, la recorrida los marca a todos con "¿FALTA
-- REGISTRAR?", que es justo el aviso que tiene que seguir siendo creible: si un
-- corte de luz pinta de rojo veinte palets, la marca se vuelve ruido y se deja
-- de mirar. Un desvio abierto explica la espera de todos mientras dure.
--
-- Este archivo agrega SOLO el valor del enum. El indice que lo nombra va en
-- 0003, porque Postgres no deja USAR un valor de enum en la misma transaccion
-- en que se agrega ("unsafe use of new value of enum type").

ALTER TYPE estanterias.tipo_aviso ADD VALUE IF NOT EXISTS 'empaque_parado';
