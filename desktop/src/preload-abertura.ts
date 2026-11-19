/**
 * Ponte mínima da tela de abertura (window.oposAbertura). Só RECEBE o estado da abertura.
 * A única coisa que sai é a escolha do caso "PC desligado" ("fechar" ou "pedir-de-novo"), um valor fixo;
 * o processo principal confere de novo quem mandou e pede confirmação na janela nativa antes de apagar algo.
 * Nada de Node, disco, token ou configuração passa por aqui.
 */
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld(
  "oposAbertura",
  Object.freeze({
    aoMudar: (cb: (estado: unknown) => void) => {
      ipcRenderer.on("abertura:estado", (_e, estado: unknown) => cb(estado))
    },
    escolher: (valor: string) => {
      if (valor === "fechar" || valor === "pedir-de-novo") ipcRenderer.send("abertura:escolha", valor)
    },
  }),
)
