/**
 * A ponte pequena e tipada entre a página do OperacionalOS e o app (nota 27): window.opos.
 * Roda com sandbox e isolamento de contexto: a página não alcança o Node nem o disco, só estas funções.
 * O processo principal confere de novo quem chamou (origem e quadro principal) antes de responder.
 * Nada aqui devolve segredo: a chave entra e nunca sai.
 */
import { contextBridge, ipcRenderer } from "electron"

const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld(
  "opos",
  Object.freeze({
    isApp: true,
    version: () => call("opos:version"),
    theme: Object.freeze({
      get: () => call("opos:theme:get"),
      /** "claro" | "escuro" | "sistema": a janela do Windows acompanha */
      set: (mode: string) => call("opos:theme:set", mode),
    }),
    pc: Object.freeze({
      status: () => call("opos:pc:status"),
      /** Cria a credencial deste PC no cofre e devolve só o hash e os 4 últimos caracteres, para a tela chamar office_request_pc. */
      beginPairing: (name: string) => call("opos:pc:pair", name),
      start: () => call("opos:pc:start"),
      stopAll: () => call("opos:pc:stop"),
      forget: () => call("opos:pc:forget"),
    }),
    folders: Object.freeze({
      list: (agentId: string) => call("opos:folders:list", agentId),
      /** Abre o seletor de pasta do Windows e pede a confirmação na janela nativa. */
      add: (agentId: string, botName: string) => call("opos:folders:add", agentId, botName),
      remove: (agentId: string, path: string) => call("opos:folders:remove", agentId, path),
    }),
    level: Object.freeze({
      get: (agentId: string) => call("opos:level:get", agentId),
      /** Subir o nível pede a confirmação na janela nativa; a página sozinha não sobe o poder do bot. */
      confirm: (agentId: string, level: number, botName: string) => call("opos:level:confirm", agentId, level, botName),
    }),
    keys: Object.freeze({
      save: (connectionId: string, provider: string, key: string, endpoint?: string) => call("opos:keys:save", connectionId, provider, key, endpoint ?? null),
      has: (connectionId: string, provider: string, endpoint?: string) => call("opos:keys:has", connectionId, provider, endpoint ?? null),
      remove: (connectionId: string, provider: string, endpoint?: string) => call("opos:keys:remove", connectionId, provider, endpoint ?? null),
    }),
    log: Object.freeze({ open: () => call("opos:log:open") }),
    onEngineState: (cb: (s: { state: string; job?: string; agent?: string; reason?: string }) => void) => {
      const h = (_e: unknown, s: { state: string }) => cb(s)
      ipcRenderer.on("opos:engine-state", h)
      return () => ipcRenderer.removeListener("opos:engine-state", h)
    },
  }),
)
