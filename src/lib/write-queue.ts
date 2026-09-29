/**
 * Gravações do mesmo registro saem em FILA (uma termina, a próxima começa).
 * Sem isso, digitar rápido dispara várias gravações em paralelo e uma mais
 * antiga pode chegar depois da mais nova no banco, apagando o que foi digitado.
 * Registros diferentes continuam gravando em paralelo.
 */
const chains = new Map<string, Promise<unknown>>()

export function queueWrite<T>(key: string, write: () => PromiseLike<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(write)
  chains.set(key, next)
  next.then(
    () => chains.get(key) === next && chains.delete(key),
    () => chains.get(key) === next && chains.delete(key),
  )
  return next
}
