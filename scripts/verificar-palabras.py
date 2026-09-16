"""
Verifica datos/palabras.json contra las reglas de ARQUITECTURA.md §10.3.

    python scripts/verificar-palabras.py

Correrlo cada vez que se edita la lista. Sale con codigo 1 si hay problemas
bloqueantes; los avisos de "revisar" no bloquean pero conviene mirarlos, porque
afectan a las palabras que se usan todos los dias.
"""
import io, itertools, json, sys, unicodedata

sys.stdout.reconfigure(encoding="utf-8")

# Palabras del proceso, colores y tonos, materiales de planta, seguridad y las
# que en planta se prestan a chiste o insulto. Ver §10.3.
PROHIBIDAS = set("""trompo molde contramolde horno patio estante estanteria palet paquete tunel placa
tarjeta gancho tablero carro soporte fierro esqueleto balde bolson bolsa cemento cal arena piedra laja
ladrillo baldosa azulejo adoquin grafito granito perla basalto volcan trigo beige gris terracota habano
negro blanco cafe canela coral cobre crema caramelo chocolate avellana almendra durazno damasco marfil
ceniza fuego gas grieta fisura rotura guante casco cuchara carretilla burro foca gallina ganso gato
gorila bagre concha cajeta cola bola paja pito goma grasa envase etiqueta aerosol espatula mezcla
listo""".split())

LETRAS = ["A", "B", "C", "D", "E", "F", "G"]
TOP = 25  # las que salen todos los dias o casi


def sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def distancia(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def sonido(letra: str, palabra: str):
    s = sin_tildes(palabra).lower()
    if not s.startswith(letra.lower()):
        return "no empieza con la letra del dia"
    if letra == "C" and not s.startswith(("ca", "co", "cu")):
        return "la C tiene que sonar dura (ca, co, cu)"
    if letra == "G" and not s.startswith(("ga", "go", "gu", "gl", "gr")):
        return "la G tiene que sonar dura (ga, go, gu)"
    return None


def main() -> int:
    datos = json.load(io.open("datos/palabras.json", encoding="utf-8"))
    bloqueantes = 0
    vistas: dict[str, str] = {}

    letras = [d["letra"] for d in datos["dias"]]
    if letras != LETRAS:
        print(f"Las letras tienen que ser {LETRAS} en ese orden, y son {letras}")
        bloqueantes += 1

    for d in datos["dias"]:
        L, pal = d["letra"], d["palabras"]
        if len(pal) != 70:
            print(f"[{L}] tiene {len(pal)} palabras, se esperan 70")
            bloqueantes += 1
        for i, p in enumerate(pal, 1):
            if (e := sonido(L, p)):
                print(f"[{L}] {i} {p}: {e}")
                bloqueantes += 1
            k = sin_tildes(p).lower()
            if k in PROHIBIDAS:
                print(f"[{L}] {i} {p}: esta en la lista de palabras prohibidas")
                bloqueantes += 1
            if k in vistas:
                print(f"[{L}] {i} {p}: repetida (ya esta en {vistas[k]})")
                bloqueantes += 1
            vistas[k] = L
        norm = [sin_tildes(p).lower() for p in pal]
        for (i, a), (j, b) in itertools.combinations(enumerate(norm, 1), 2):
            dist = distancia(a, b)
            if dist <= 1:
                print(f"[{L}] suenan casi igual: {i} {pal[i-1]} / {j} {pal[j-1]}")
                bloqueantes += 1
            elif dist == 2 and i <= TOP and j <= TOP:
                print(f"[{L}] revisar, parecidas entre las primeras {TOP}: {i} {pal[i-1]} / {j} {pal[j-1]}")

    print(f"\nProblemas bloqueantes: {bloqueantes}")
    return 1 if bloqueantes else 0


if __name__ == "__main__":
    sys.exit(main())
