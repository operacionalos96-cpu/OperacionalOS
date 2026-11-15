/**
 * Ponte mínima da bolinha flutuante (window.oposBolinha).
 * Entra: o estado visual ("quieta", "lenta", "girando", "alerta"), o tema e o texto de ajuda.
 * Sai: só avisos sem dados ("apertou", "moveu", "soltou", "cancelou", "menu"). Quem lê a posição do mouse, decide
 * clique ou arraste e move a janela é o processo principal; daqui não sai coordenada, texto ou caminho.
 */
import { contextBridge, ipcRenderer } from "electron"

const AVISOS = new Set(["apertou", "moveu", "soltou", "cancelou", "menu"])

contextBridge.exposeInMainWorld(
  "oposBolinha",
  Object.freeze({
    aoMudar: (cb: (estado: unknown) => void) => {
      ipcRenderer.on("bolinha:estado", (_e, estado: unknown) => cb(estado))
    },
    avisar: (aviso: string) => {
      if (AVISOS.has(aviso)) ipcRenderer.send("bolinha:aviso", aviso)
    },
  }),
)
