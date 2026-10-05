-- 0004 · Arido de la formula y codigos del ERP Plataforma en los productos.
--
-- Arido: hay dos formulas. "alivianado" (granulado volcanico + dolomita) y
-- "hormigon" (arena + piedra). Es un dato del producto, como el cemento, y la
-- tanda guarda una copia al llenarse para que el historial no cambie si despues
-- se corrige el producto. NO es regla de compatibilidad de estanteria: lo que
-- impide mezclar moldes es el cemento, no el arido.
--
-- El DEFAULT 'hormigon' solo existe para completar las filas que ya estan
-- cargadas; el panel y la planilla piden el arido explicito al crear un
-- producto. Revisar los productos existentes despues de migrar.
--
-- Codigos de Plataforma: uno de producto en proceso y otro de producto
-- terminado. Texto y no numero, porque un codigo de ERP puede tener ceros a la
-- izquierda o letras. Opcionales, pero si estan cargados no se repiten entre
-- productos: dos productos con el mismo codigo romperian cualquier cruce futuro
-- con el ERP.

DO $$ BEGIN
  CREATE TYPE estanterias.arido AS ENUM ('alivianado', 'hormigon');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE estanterias.productos ADD COLUMN IF NOT EXISTS arido estanterias.arido NOT NULL DEFAULT 'hormigon';
ALTER TABLE estanterias.tandas    ADD COLUMN IF NOT EXISTS arido estanterias.arido NOT NULL DEFAULT 'hormigon';

ALTER TABLE estanterias.productos ADD COLUMN IF NOT EXISTS codigo_plataforma_proceso   text;
ALTER TABLE estanterias.productos ADD COLUMN IF NOT EXISTS codigo_plataforma_terminado text;

CREATE UNIQUE INDEX IF NOT EXISTS productos_plataforma_proceso_idx
  ON estanterias.productos (codigo_plataforma_proceso)
  WHERE codigo_plataforma_proceso IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS productos_plataforma_terminado_idx
  ON estanterias.productos (codigo_plataforma_terminado)
  WHERE codigo_plataforma_terminado IS NOT NULL;

-- La tanda copia el arido de su producto. Las tandas que ya existen toman el
-- del producto actual, que es lo mejor que se sabe.
UPDATE estanterias.tandas t SET arido = p.arido
  FROM estanterias.productos p WHERE p.id = t.producto_id AND t.arido <> p.arido;
