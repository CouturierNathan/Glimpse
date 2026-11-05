import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

export default buildModule('Glimpse', (m) => {
  const issuerRegistry = m.contract('IssuerRegistry')
  const attestationRegistry = m.contract('AttestationRegistry', [issuerRegistry])
  return { issuerRegistry, attestationRegistry }
})
