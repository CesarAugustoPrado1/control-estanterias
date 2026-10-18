-- 0010 · Programa de produccion: lo que se pide hacer cada dia.
--
-- Es la hoja que hoy se escribe a mano: arriba el llenado (trompo), abajo el
-- desmolde y empaque. Cada linea es "N maquinadas de tal producto" con una nota
-- libre (cliente, pedido, "11/15", STR, "a confirmar").
--
-- Lo hecho NO se carga en el programa: sale de lo que ya se registra (llenados
-- y desmoldes de ese dia). Al cerrar el dia se guarda una foto de lo hecho por
-- linea, para que el cumplimiento quede registrado aunque despues se corrija
-- algo. Lo que falto lleva el motivo que informa el puesto, y se puede
-- reprogramar: la linea nueva recuerda de donde vino.
--
-- Idempotente, como las anteriores.

DO $$ BEGIN
  CREATE TYPE estanterias.seccion_programa AS ENUM ('llenado', 'desmolde');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS estanterias.motivos_incumplimiento (
  id     serial PRIMARY KEY,
  nombre text NOT NULL,
  orden  integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS motivos_incumplimiento_nombre_idx
  ON estanterias.motivos_incumplimiento (nombre);

INSERT INTO estanterias.motivos_incumplimiento (nombre, orden) VALUES
  ('No alcanzó el tiempo', 1),
  ('Faltó material', 2),
  ('No había estanterías libres', 3),
  ('Rotura o falla de máquina', 4),
  ('Faltó personal', 5),
  ('Corte de luz', 6),
  ('Cambio de prioridad', 7),
  ('Otro', 99)
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS estanterias.programa_dias (
  dia         date PRIMARY KEY,
  cerrado_en  timestamptz,
  cerrado_por text
);

CREATE TABLE IF NOT EXISTS estanterias.programa_lineas (
  id              serial PRIMARY KEY,
  dia             date NOT NULL,
  seccion         estanterias.seccion_programa NOT NULL,
  producto_id     integer NOT NULL REFERENCES estanterias.productos (id),
  cantidad        integer NOT NULL CHECK (cantidad > 0),
  nota            text,
  orden           integer NOT NULL DEFAULT 0,
  -- Foto de lo hecho al cerrar el dia. Null mientras el dia esta abierto.
  hechas_cierre   integer,
  motivo_id       integer REFERENCES estanterias.motivos_incumplimiento (id),
  motivo_nombre   text,
  motivo_nota     text,
  motivo_por      text,
  motivo_en       timestamptz,
  -- Reprogramacion: la original apunta al dia nuevo, la nueva a su origen.
  reprogramada_a  date,
  origen_id       integer REFERENCES estanterias.programa_lineas (id),
  creada_por      text,
  creada_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS programa_lineas_dia_idx
  ON estanterias.programa_lineas (dia, seccion, orden);
