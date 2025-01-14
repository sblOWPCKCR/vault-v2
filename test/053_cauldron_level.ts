import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { constants } from '@yield-protocol/utils-v2'
const { WAD } = constants
import { RATE } from '../src/constants'

import { Cauldron } from '../typechain/Cauldron'
import { FYToken } from '../typechain/FYToken'
import { ERC20Mock as ERC20 } from '../typechain/ERC20Mock'
import { ChainlinkMultiOracle } from '../typechain/ChainlinkMultiOracle'
import { CompoundMultiOracle } from '../typechain/CompoundMultiOracle'
import { ISourceMock } from '../typechain/ISourceMock'

import { YieldEnvironment } from './shared/fixtures'

import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
const { loadFixture } = waffle

describe('Cauldron - level', function () {
  this.timeout(0)

  let ownerAcc: SignerWithAddress
  let owner: string
  let env: YieldEnvironment
  let cauldron: Cauldron
  let fyToken: FYToken
  let base: ERC20
  let ilk: ERC20
  let spotOracle: ChainlinkMultiOracle
  let spotSource: ISourceMock
  let rateOracle: CompoundMultiOracle
  let rateSource: ISourceMock

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const ilkId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const seriesId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  let vaultId: string

  async function fixture() {
    return await YieldEnvironment.setup(ownerAcc, [baseId, ilkId], [seriesId])
  }

  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = await ownerAcc.getAddress()
  })

  after(async () => {
    await loadFixture(fixture) // We advance the time to test maturity features, this rolls it back after the tests
  })

  beforeEach(async function () {
    this.timeout(0)
    env = await loadFixture(fixture)
    cauldron = env.cauldron
    base = env.assets.get(baseId) as ERC20
    ilk = env.assets.get(ilkId) as ERC20

    rateOracle = (env.oracles.get(RATE) as unknown) as CompoundMultiOracle
    rateSource = (await ethers.getContractAt('ISourceMock', await rateOracle.sources(baseId, RATE))) as ISourceMock
    spotOracle = (env.oracles.get(ilkId) as unknown) as ChainlinkMultiOracle
    spotSource = (await ethers.getContractAt(
      'ISourceMock',
      (await spotOracle.sources(baseId, ilkId))[0]
    )) as ISourceMock
    fyToken = env.series.get(seriesId) as FYToken
    vaultId = (env.vaults.get(seriesId) as Map<string, string>).get(ilkId) as string

    await spotSource.set(WAD.mul(2))
    await cauldron.pour(vaultId, WAD, WAD)
  })

  it('before maturity, level is ink * spot - art * ratio', async () => {
    const ink = (await cauldron.balances(vaultId)).ink
    const art = (await cauldron.balances(vaultId)).art
    for (let spot of [1, 2, 4]) {
      await spotSource.set(WAD.mul(spot))
      for (let ratio of [50, 100, 200]) {
        await cauldron.setSpotOracle(baseId, ilkId, spotOracle.address, ratio * 10000)
        const expectedLevel = ink.mul(spot).sub(art.mul(ratio).div(100))
        expect(await cauldron.callStatic.level(vaultId)).to.equal(expectedLevel)
        // console.log(`${ink} * ${WAD.mul(spot)} - ${art} * ${ratio} = ${await cauldron.level(vaultId)} | ${expectedLevel} `)
      }
    }
  })

  it("users can't borrow and become undercollateralized", async () => {
    await expect(cauldron.pour(vaultId, 0, WAD.mul(2))).to.be.revertedWith('Undercollateralized')
  })

  it("users can't withdraw and become undercollateralized", async () => {
    await expect(cauldron.pour(vaultId, WAD.mul(-1), 0)).to.be.revertedWith('Undercollateralized')
  })

  it('does not allow to mature before maturity', async () => {
    await expect(cauldron.mature(seriesId)).to.be.revertedWith('Only after maturity')
  })

  describe('after maturity', async () => {
    beforeEach(async () => {
      await spotSource.set(WAD.mul(1))
      await rateSource.set(WAD.mul(1))
      await ethers.provider.send('evm_mine', [(await fyToken.maturity()).toNumber()])
    })

    it('matures by recording the rate value', async () => {
      expect(await cauldron.mature(seriesId))
        .to.emit(cauldron, 'SeriesMatured')
        .withArgs(seriesId, WAD)
    })

    it("rate accrual can't be below 1", async () => {
      await rateSource.set(WAD.mul(100).div(110))
      expect(await cauldron.callStatic.accrual(seriesId)).to.equal(WAD)
    })

    it('after maturity, level is ink * spot - art * accrual * ratio', async () => {
      await cauldron.level(vaultId)

      const ink = (await cauldron.balances(vaultId)).ink
      const art = (await cauldron.balances(vaultId)).art
      for (let spot of [1, 2, 4]) {
        await spotSource.set(WAD.mul(spot))
        for (let rate of [110, 120, 140]) {
          await rateSource.set(WAD.mul(rate).div(100))
          // accrual = rate / 100
          for (let ratio of [50, 100, 200]) {
            await cauldron.setSpotOracle(baseId, ilkId, spotOracle.address, ratio * 10000)
            const expectedLevel = ink.mul(spot).sub(art.mul(rate).mul(ratio).div(10000))
            expect(await cauldron.callStatic.level(vaultId)).to.equal(expectedLevel)
            // console.log(`${ink} * ${RAY.mul(spot)} - ${art} * ${ratio} = ${await cauldron.level(vaultId)} | ${expectedLevel} `)
          }
        }
      }
    })
  })
})
