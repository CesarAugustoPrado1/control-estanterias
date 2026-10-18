-- 0013 · Lavados del trompo, por dia de produccion.
--
-- El trompo se lava al menos una vez al dia, al terminar, para dejarlo limpio
-- para el dia siguiente. Ese ultimo lavado NO se cuenta: aca va cuantas veces
-- se lavo ADEMAS de ese (cambios de cemento, etc.). Es para medir y despues
-- optimizar el proceso. Un numero por dia; lo carga el operario del trompo.

CREATE TABLE IF NOT EXISTS estanterias.lavados_trompo (
  dia date PRIMARY KEY,
  cantidad integer NOT NULL CHECK (cantidad >= 0),
  cargado_por text,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
