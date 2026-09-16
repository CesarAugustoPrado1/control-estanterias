-- 0001 · Identificacion en planta (ARQUITECTURA.md §10)
--
-- Cemento como dato propio, numero de placa por estanteria, tarjetas de tanda,
-- avisos del piso y reasignaciones de grupos de moldes.
--
-- Es IDEMPOTENTE a proposito: se escribio despues de que `drizzle-kit push`
-- dejara esta misma migracion aplicada a medias (ver §9.5), asi que tiene que
-- poder correr sobre una base que ya tiene una parte. Cada sentencia se saltea
-- sola si lo suyo ya existe. Corre entera dentro de una transaccion.

-- Tipos ---------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE estanterias.cemento AS ENUM ('gris', 'blanco');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estanterias.tipo_aviso AS ENUM ('tarjeta_no_coincide', 'tarjeta_perdida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE estanterias.tipo_movimiento ADD VALUE IF NOT EXISTS 'cambio_tarjeta';

-- Tablas nuevas -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS estanterias.tarjetas (
  id            serial PRIMARY KEY,
  letra         text NOT NULL,
  orden         integer NOT NULL,
  palabra       text NOT NULL,
  activa        boolean NOT NULL DEFAULT true,
  perdida_desde timestamptz
);

CREATE TABLE IF NOT EXISTS estanterias.avisos (
  id             serial PRIMARY KEY,
  tipo           estanterias.tipo_aviso NOT NULL,
  tanda_id       integer,
  tarjeta_id     integer,
  texto          text NOT NULL,
  usuario_id     integer NOT NULL,
  usuario_nombre text NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  resuelto_en    timestamptz,
  resuelto_por   text,
  resolucion     text
);

CREATE TABLE IF NOT EXISTS estanterias.reasignaciones (
  id               serial PRIMARY KEY,
  estanteria_id    integer NOT NULL,
  etiqueta_antes   text NOT NULL,
  etiqueta_despues text NOT NULL,
  familia_antes    text NOT NULL,
  familia_despues  text NOT NULL,
  cemento_antes    estanterias.cemento NOT NULL,
  cemento_despues  estanterias.cemento NOT NULL,
  motivo           text NOT NULL,
  usuario_id       integer NOT NULL,
  usuario_nombre   text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now()
);

-- Columnas nuevas en tablas existentes ---------------------------------------

ALTER TABLE estanterias.productos   ADD COLUMN IF NOT EXISTS cemento estanterias.cemento NOT NULL DEFAULT 'gris';
ALTER TABLE estanterias.estanterias ADD COLUMN IF NOT EXISTS cemento estanterias.cemento NOT NULL DEFAULT 'gris';
ALTER TABLE estanterias.estanterias ADD COLUMN IF NOT EXISTS numero integer;
ALTER TABLE estanterias.tandas      ADD COLUMN IF NOT EXISTS cemento estanterias.cemento NOT NULL DEFAULT 'gris';
ALTER TABLE estanterias.tandas      ADD COLUMN IF NOT EXISTS estanteria_etiqueta text;
ALTER TABLE estanterias.tandas      ADD COLUMN IF NOT EXISTS tarjeta_id integer;
ALTER TABLE estanterias.tandas      ADD COLUMN IF NOT EXISTS tarjeta_palabra text;
ALTER TABLE estanterias.tandas      ADD COLUMN IF NOT EXISTS tarjeta_letra text;
ALTER TABLE estanterias.tandas      ADD COLUMN IF NOT EXISTS tarjeta_orden integer;
ALTER TABLE estanterias.movimientos ADD COLUMN IF NOT EXISTS tanda_palabra text;

-- Claves foraneas ------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE estanterias.tandas ADD CONSTRAINT tandas_tarjeta_id_tarjetas_id_fk
    FOREIGN KEY (tarjeta_id) REFERENCES estanterias.tarjetas(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE estanterias.avisos ADD CONSTRAINT avisos_tanda_id_tandas_id_fk
    FOREIGN KEY (tanda_id) REFERENCES estanterias.tandas(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE estanterias.avisos ADD CONSTRAINT avisos_tarjeta_id_tarjetas_id_fk
    FOREIGN KEY (tarjeta_id) REFERENCES estanterias.tarjetas(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE estanterias.avisos ADD CONSTRAINT avisos_usuario_id_usuarios_id_fk
    FOREIGN KEY (usuario_id) REFERENCES estanterias.usuarios(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE estanterias.reasignaciones ADD CONSTRAINT reasignaciones_estanteria_id_estanterias_id_fk
    FOREIGN KEY (estanteria_id) REFERENCES estanterias.estanterias(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE estanterias.reasignaciones ADD CONSTRAINT reasignaciones_usuario_id_usuarios_id_fk
    FOREIGN KEY (usuario_id) REFERENCES estanterias.usuarios(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indices ----------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS tarjetas_letra_orden_idx ON estanterias.tarjetas (letra, orden);
CREATE UNIQUE INDEX IF NOT EXISTS tarjetas_palabra_idx     ON estanterias.tarjetas (palabra);
CREATE INDEX        IF NOT EXISTS avisos_abiertos_idx      ON estanterias.avisos (resuelto_en);
CREATE INDEX        IF NOT EXISTS reasignaciones_estanteria_idx ON estanterias.reasignaciones (estanteria_id);

-- La compatibilidad ahora incluye el cemento.
DROP INDEX IF EXISTS estanterias.productos_modelo_familia_idx;
CREATE INDEX productos_modelo_familia_idx ON estanterias.productos (modelo_id, familia_id, cemento);
DROP INDEX IF EXISTS estanterias.estanterias_modelo_familia_idx;
CREATE INDEX estanterias_modelo_familia_idx ON estanterias.estanterias (modelo_id, familia_id, cemento);

-- La placa dice MODELO · FAMILIA · NUMERO: unico en ese trio.
CREATE UNIQUE INDEX IF NOT EXISTS estanterias_placa_idx ON estanterias.estanterias (modelo_id, familia_id, numero);

-- Las dos reglas fisicas del circuito, garantizadas por la base:
-- una estanteria no retiene dos tandas, una tarjeta no cuelga de dos tandas vivas.
CREATE UNIQUE INDEX IF NOT EXISTS tandas_estanteria_retenida_idx
  ON estanterias.tandas (estanteria_id) WHERE estado IN ('patio', 'horno', 'a_desmoldar');
CREATE UNIQUE INDEX IF NOT EXISTS tandas_tarjeta_en_uso_idx
  ON estanterias.tandas (tarjeta_id) WHERE estado <> 'listo';

-- Relleno generico (vale para datos reales, no solo de prueba) -----------------
-- `push` no rellena filas existentes (§9.4 de Secaderos): se hace explicito.

-- Numero de placa para las estanterias que no tienen: primero el numero final
-- del codigo si lo hay (KAM-GRI-03 -> 3), y si choca o no hay, el siguiente
-- libre dentro de modelo + familia.
WITH candidatos AS (
  SELECT id, modelo_id, familia_id,
         NULLIF(substring(codigo from '(\d+)\s*$'), '')::int AS del_codigo
  FROM estanterias.estanterias
  WHERE numero IS NULL
),
numerados AS (
  SELECT c.id,
         row_number() OVER (PARTITION BY c.modelo_id, c.familia_id
                            ORDER BY c.del_codigo NULLS LAST, c.id) AS pos
  FROM candidatos c
)
UPDATE estanterias.estanterias e
SET numero = n.pos + COALESCE((
      SELECT max(x.numero) FROM estanterias.estanterias x
      WHERE x.modelo_id = e.modelo_id AND x.familia_id = e.familia_id AND x.numero IS NOT NULL
    ), 0)
FROM numerados n
WHERE e.id = n.id;
