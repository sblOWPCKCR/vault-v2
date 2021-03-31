import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { WAD } from './shared/constants'

import { Cauldron } from '../typechain/Cauldron'
import { FYToken } from '../typechain/FYToken'
import { ERC20Mock } from '../typechain/ERC20Mock'
import { Ladle } from '../typechain/Ladle'

import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
const { loadFixture } = waffle

import { YieldEnvironment } from './shared/fixtures'

describe('Ladle - stir', function () {
  this.timeout(0)

  let env: YieldEnvironment
  let ownerAcc: SignerWithAddress
  let otherAcc: SignerWithAddress
  let owner: string
  let other: string
  let cauldron: Cauldron
  let fyToken: FYToken
  let base: ERC20Mock
  let ladle: Ladle
  let ladleFromOther: Ladle

  async function fixture() {
    return await YieldEnvironment.setup(ownerAcc, [baseId, ilkId, otherIlkId], [seriesId])
  }

  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = await ownerAcc.getAddress()

    otherAcc = signers[1]
    other = await otherAcc.getAddress()
  })

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const ilkId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const seriesId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const vaultToId = ethers.utils.hexlify(ethers.utils.randomBytes(12))
  const otherIlkId = ethers.utils.hexlify(ethers.utils.randomBytes(6))

  let vaultFromId: string

  beforeEach(async () => {
    env = await loadFixture(fixture)
    cauldron = env.cauldron
    ladle = env.ladle
    base = env.assets.get(baseId) as ERC20Mock
    fyToken = env.series.get(seriesId) as FYToken

    ladleFromOther = ladle.connect(otherAcc)

    vaultFromId = (env.vaults.get(seriesId) as Map<string, string>).get(ilkId) as string

    // ==== Set testing environment ====
    await cauldron.build(owner, vaultToId, seriesId, ilkId)
  })

  it('does not allow moving collateral other than to the origin vault owner', async () => {
    await expect(ladleFromOther.stir(vaultFromId, vaultToId, WAD, 0)).to.be.revertedWith('Only origin vault owner')
  })

  it('does not allow moving debt other than to the destination vault owner', async () => {
    await expect(ladleFromOther.stir(vaultFromId, vaultToId, 0, WAD)).to.be.revertedWith('Only destination vault owner')
  })

  it('moves collateral', async () => {
    await ladle.pour(vaultFromId, owner, WAD, 0)
    expect(await ladle.stir(vaultFromId, vaultToId, WAD, 0))
      .to.emit(cauldron, 'VaultStirred')
      .withArgs(vaultFromId, vaultToId, WAD, 0)
    expect((await cauldron.balances(vaultFromId)).ink).to.equal(0)
    expect((await cauldron.balances(vaultToId)).ink).to.equal(WAD)
  })

  it('moves debt', async () => {
    await ladle.pour(vaultFromId, owner, WAD, WAD)
    await ladle.pour(vaultToId, owner, WAD, 0)
    expect(await ladle.stir(vaultFromId, vaultToId, 0, WAD))
      .to.emit(cauldron, 'VaultStirred')
      .withArgs(vaultFromId, vaultToId, 0, WAD)
    expect((await cauldron.balances(vaultFromId)).art).to.equal(0)
    expect((await cauldron.balances(vaultToId)).art).to.equal(WAD)
  })
})