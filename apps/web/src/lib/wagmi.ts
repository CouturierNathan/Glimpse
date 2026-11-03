import { createConfig, http, injected } from 'wagmi'

import { appChain } from './chains.ts'

export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors: [injected()],
  transports: { [appChain.id]: http() },
  ssr: true,
})
