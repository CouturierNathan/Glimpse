import hardhatToolboxViemPlugin from '@nomicfoundation/hardhat-toolbox-viem'
import { configVariable, defineConfig } from 'hardhat/config'

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: '0.8.34',
    settings: { evmVersion: 'prague', optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    baseSepolia: {
      type: 'http',
      chainType: 'op',
      chainId: 84532,
      url: 'https://sepolia.base.org',
      accounts: [configVariable('BASE_SEPOLIA_PRIVATE_KEY')],
    },
  },
})
