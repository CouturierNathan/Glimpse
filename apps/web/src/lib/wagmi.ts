import { createConfig, http, injected } from 'wagmi'

import { appChain, appRpc } from './chains.ts'

export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors: [injected()],
  transports: { [appChain.id]: http(appRpc) },
  ssr: true,
})
