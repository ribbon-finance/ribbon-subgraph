import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  Staked,
  Withdrawn,
  RewardPaid,
  RibbonStakingRewards
} from "../generated/RibbonETHCallLiquidityMining/RibbonStakingRewards";
import {
  VaultLiquidityMiningPool,
  VaultLiquidityMiningPoolAccount
} from "../generated/schema";
import { getOrCreateLiquidityMiningPoolAccount } from "./accounts";

function getOrCreateVaultLiquidityMiningPool(
  poolAddress: string
): VaultLiquidityMiningPool {
  let pool = VaultLiquidityMiningPool.load(poolAddress);

  if (pool == null) {
    pool = new VaultLiquidityMiningPool(poolAddress);
    let miningPoolContract = RibbonStakingRewards.bind(
      Address.fromString(poolAddress)
    );
    pool.numDepositors = 0;
    pool.depositors = [];
    pool.totalRewardClaimed = BigInt.fromI32(0);
    pool.totalSupply = miningPoolContract.totalSupply();
    pool.save();
  }
  return pool as VaultLiquidityMiningPool;
}

function updateVaultLiquidityMiningAccountBalance(
  poolAddress: Address,
  userAddress: Address,
  poolAccount: VaultLiquidityMiningPoolAccount
): void {
  const poolContract = RibbonStakingRewards.bind(poolAddress);

  let callResult = poolContract.try_balanceOf(userAddress);

  if (!callResult.reverted) {
    poolAccount.totalBalance = callResult.value;
    poolAccount.save();
  }
}

function updateVaultLiquidityMiningBalance(
  poolAddress: Address,
  pool: VaultLiquidityMiningPool
): void {
  const poolContract = RibbonStakingRewards.bind(poolAddress);

  pool.totalSupply = poolContract.totalSupply();
  pool.save();
}

export function handleStaked(event: Staked): void {
  let poolAddress = event.address.toHexString();
  const pool = getOrCreateVaultLiquidityMiningPool(poolAddress);
  const poolAccount = getOrCreateLiquidityMiningPoolAccount(
    event.address,
    event.params.user
  );

  updateVaultLiquidityMiningAccountBalance(
    event.address,
    event.params.user,
    poolAccount
  );

  updateVaultLiquidityMiningBalance(event.address, pool);
}

export function handleWithdrawn(event: Withdrawn): void {
  let poolAddress = event.address.toHexString();
  const pool = getOrCreateVaultLiquidityMiningPool(poolAddress);
  const poolAccount = getOrCreateLiquidityMiningPoolAccount(
    event.address,
    event.params.user
  );

  updateVaultLiquidityMiningAccountBalance(
    event.address,
    event.params.user,
    poolAccount
  );

  updateVaultLiquidityMiningBalance(event.address, pool);
}

export function handleRewardPaid(event: RewardPaid): void {
  let poolAddress = event.address.toHexString();
  const pool = getOrCreateVaultLiquidityMiningPool(poolAddress);
  const poolAccount = getOrCreateLiquidityMiningPoolAccount(
    event.address,
    event.params.user
  );

  poolAccount.totalRewardClaimed =
    poolAccount.totalRewardClaimed + event.params.reward;
  poolAccount.save();

  pool.totalRewardClaimed = pool.totalRewardClaimed + event.params.reward;
  pool.save();

  updateVaultLiquidityMiningAccountBalance(
    event.address,
    event.params.user,
    poolAccount
  );

  updateVaultLiquidityMiningBalance(event.address, pool);
}
