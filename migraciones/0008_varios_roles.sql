-- 0008 · Un usuario puede tener varios roles.
--
-- Hay gente que hace mas de un puesto (trompo y horno, desmolde y empaque). Con
-- un solo rol habia que crearle dos usuarios y recordar dos PIN.
--
-- `roles` es la lista que manda. `rol` queda como el rol principal -el de la
-- pantalla donde cae al entrar- y se sigue llenando: asi esta migracion se puede
-- correr antes de desplegar el codigo nuevo sin que el viejo se rompa.
--
-- Idempotente: el UPDATE solo toca a los que todavia no tienen lista.

ALTER TABLE estanterias.usuarios
  ADD COLUMN IF NOT EXISTS roles estanterias.rol[] NOT NULL DEFAULT '{}';

UPDATE estanterias.usuarios
SET roles = ARRAY[rol]
WHERE cardinality(roles) = 0;
