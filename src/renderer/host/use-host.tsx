import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { HostBridge } from './host-contract'
import { createElectronBridge, isElectronHostAvailable } from './host-bridge'
import { createMockBridge } from './host-mock'

/**
 * Capability detection, not environment sniffing. If the preload global is
 * present we are in Electron; otherwise the mock takes over and the whole UI
 * still works (constitution Principle I).
 */
export function selectHostBridge(): HostBridge {
  return isElectronHostAvailable() ? createElectronBridge() : createMockBridge()
}

const HostContext = createContext<HostBridge | null>(null)

export function HostProvider({
  children,
  bridge
}: {
  children: ReactNode
  bridge?: HostBridge
}): ReactNode {
  const value = useMemo(() => bridge ?? selectHostBridge(), [bridge])
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>
}

export function useHost(): HostBridge {
  const bridge = useContext(HostContext)
  if (!bridge) throw new Error('useHost must be used inside <HostProvider>')
  return bridge
}
