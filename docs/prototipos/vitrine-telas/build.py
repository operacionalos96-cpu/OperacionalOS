"""Monta apresentacao-vitrine.html: recorta as capturas (coordenadas em px de tela 1600x900; a captura é 2x),
grava WebP aqui e embute tudo no deck (deck-template.html). Rodar: python build.py"""
import base64, io, os, re, shutil
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", "..", ".."))  # OperacionalOS-App-vitrine
SCR = r"C:\Users\Gabriel\AppData\Local\Temp\claude\b46db3033b0650a9\59a77ef4-cde3-4bfd-8efa-492f24b6b469\scratchpad"
RAW = os.path.join(AQUI, "capturas")

# nome: (arquivo, recorte em px de tela (x0,y0,x1,y1) ou None, largura final em px, qualidade)
TELAS = {
    "capa": ("inicio-escuro.png", None, 1600, 80),
    "inicio": ("inicio-claro.png", None, 1400, 80),
    "pipeline-escuro": ("pipeline-escuro.png", None, 1400, 80),
    "financeiro": ("financeiro-claro.png", None, 1400, 80),
    "tarefas-escuro": ("tarefas-escuro.png", None, 1400, 80),
    "dock-conversa": ("dock-claro.png", (120, 180, 1560, 560), 2400, 82),
    "t-bots": ("dock-bots-claro.png", (98, 165, 800, 485), 900, 80),
    "t-apps": ("dock-apps-claro.png", (98, 165, 800, 485), 900, 80),
    "t-skills": ("dock-skills-claro.png", (98, 165, 800, 485), 900, 80),
    "t-ias": ("dock-ias-claro.png", (98, 165, 800, 485), 900, 80),
    "t-uso": ("dock-uso-claro.png", (98, 165, 800, 485), 900, 80),
    "t-rotinas": ("dock-rotinas-claro.png", (98, 165, 800, 485), 900, 80),
    "t-pc": ("dock-pc-claro.png", (98, 165, 800, 485), 900, 80),
    "dock-pc": ("dock-pc-aberto-claro.png", (98, 160, 1580, 592), 2400, 82),
    "orbe-app": ("dock-rotinas-claro.png", (1150, 600, 1600, 900), 900, 82),
    "sede-dia": ("sede-dia-escuro.png", (200, 262, 1176, 846), 1800, 82),
    "sede-noite": ("sede-noite-escuro.png", (200, 262, 1176, 846), 1800, 82),
    "sede-andar": ("sede-andar3b-claro.png", (124, 200, 1580, 860), 2200, 80),
}
# imagens que não são captura de tela do app
EXTRAS = {
    "bolinha-estados": (os.path.join(SCR, "bolinha-estados.png"), None, 864, 88),
    "bolinha-menu": (os.path.join(SCR, "ao-vivo-8-recorte.png"), (30, 25, 230, 185), 400, 90),
    "icone": (os.path.join(RAIZ, "desktop", "build", "icon.png"), None, 256, 90),
}


def webp(nome, src, crop, largura, q, escala=2):
    im = Image.open(src).convert("RGBA" if nome == "icone" else "RGB")
    if crop:
        x0, y0, x1, y1 = (v * escala for v in crop)
        im = im.crop((x0, y0, x1, y1))
    if im.width > largura:
        im = im.resize((largura, round(im.height * largura / im.width)), Image.LANCZOS)
    out = os.path.join(AQUI, nome + ".webp")
    im.save(out, "WEBP", quality=q, method=6)
    return out


def main():
    os.makedirs(RAW, exist_ok=True)
    arquivos = {}
    for nome, (arq, crop, w, q) in TELAS.items():
        src = os.path.join(RAW, arq)
        if not os.path.exists(src):
            shutil.copy(os.path.join(SCR, "deck", "raw", arq), src)
        arquivos[nome] = webp(nome, src, crop, w, q)
    for nome, (src, crop, w, q) in EXTRAS.items():
        arquivos[nome] = webp(nome, src, crop, w, q, escala=1)

    html = open(os.path.join(AQUI, "deck-template.html"), encoding="utf-8").read()
    for nome, f in arquivos.items():
        uri = "data:image/webp;base64," + base64.b64encode(open(f, "rb").read()).decode()
        html = html.replace(f"__{nome}__", uri)
    ab = os.path.join(RAIZ, "desktop", "abertura")
    css = open(os.path.join(ab, "abertura.css"), encoding="utf-8").read()
    js = open(os.path.join(ab, "abertura.js"), encoding="utf-8").read()
    corpo = open(os.path.join(ab, "index.html"), encoding="utf-8").read()
    corpo = corpo[corpo.index("<body>") + 6 : corpo.index("<script")]
    assert "</script" not in css + js + corpo
    html = html.replace("__AB_CSS__", css).replace("__AB_JS__", js).replace("__AB_BODY__", corpo)
    sobrou = re.findall(r"__[a-z][a-z0-9-]*__", html)
    assert not sobrou, sobrou
    out = os.path.join(AQUI, "..", "apresentacao-vitrine.html")
    open(out, "w", encoding="utf-8").write(html)
    print("ok", os.path.getsize(out) // 1024, "KB")
    for nome, f in arquivos.items():
        print(f"  {nome}: {os.path.getsize(f)//1024} KB")


if __name__ == "__main__":
    main()
