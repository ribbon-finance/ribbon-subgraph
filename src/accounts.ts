import { BigInt, Address, log } from "@graphprotocol/graph-ts";
import { RibbonOptionsVault } from "../generated/RibbonOptionsVault/RibbonOptionsVault";
import {
  BalanceUpdate,
  ERC20Token,
  ERC20TokenAccount,
  Vault,
  VaultAccount,
  VaultLiquidityMiningPool,
  VaultLiquidityMiningPoolAccount
} from "../generated/schema";

export function refreshAllAccountBalances(
  vaultAddress: Address,
  timestamp: i32
): void {
  log.debug("trigger refresh", []);
  let vault = Vault.load(vaultAddress.toHexString());

  if (vault != null) {
    for (let i = 0; i < vault.numDepositors; i++) {
      let depositors = vault.depositors;
      let depositorAddress = depositors[i];
      if (depositorAddress != null) {
        log.debug("refresh balance with premium {}", [
          depositorAddress.toHexString()
        ]);
        triggerBalanceUpdate(
          vaultAddress,
          depositorAddress as Address,
          timestamp,
          true,
          false
        );
      }
    }
  }
}

export function triggerBalanceUpdate(
  vaultAddress: Address,
  accountAddress: Address,
  timestamp: i32,
  accruesYield: bool,
  isWithdraw: bool
): void {
  let vaultID = vaultAddress.toHexString();

  let vaultContract = RibbonOptionsVault.bind(vaultAddress);

  let vaultAccount = VaultAccount.load(
    vaultAddress.toHexString() + "-" + accountAddress.toHexString()
  );

  let vault = Vault.load(vaultID);
  vault.totalBalance = vaultContract.totalBalance();
  vault.save();

  if (vaultAccount == null) {
    return;
  }

  let prevUpdateCounter = vaultAccount.updateCounter;
  let updateCounter = prevUpdateCounter + 1;

  let updateID =
    vaultAddress.toHexString() +
    "-" +
    accountAddress.toHexString() +
    "-" +
    updateCounter.toString();

  let callResult = vaultContract.try_accountVaultBalance(accountAddress);

  if (!callResult.reverted) {
    let balance = callResult.value;
    let update = new BalanceUpdate(updateID);
    update.vault = vaultID;
    update.account = accountAddress;
    update.timestamp = timestamp;
    update.balance = balance;
    update.yieldEarned = BigInt.fromI32(0);
    update.isWithdraw = isWithdraw;

    if (accruesYield) {
      let prevUpdateID =
        vaultAddress.toHexString() +
        "-" +
        accountAddress.toHexString() +
        "-" +
        prevUpdateCounter.toString();

      let prevUpdate = BalanceUpdate.load(prevUpdateID);
      if (prevUpdate != null) {
        let yieldEarned = balance.minus(prevUpdate.balance);

        if (yieldEarned.gt(BigInt.fromI32(0))) {
          update.yieldEarned = yieldEarned;
          vaultAccount.totalYieldEarned = vaultAccount.totalYieldEarned.plus(
            yieldEarned
          );
        }
      }
    }
    update.save();

    vaultAccount.totalBalance = balance;
    vaultAccount.updateCounter = updateCounter;
    vaultAccount.save();
  } else {
    log.error("calling accountVaultBalance({}) on vault {}", [
      accountAddress.toHexString(),
      vaultAddress.toHexString()
    ]);
  }
}

export function createVaultAccount(
  vaultAddress: Address,
  accountAddress: Address
): VaultAccount {
  let vault = Vault.load(vaultAddress.toHexString());
  let vaultAccountID =
    vaultAddress.toHexString() + "-" + accountAddress.toHexString();

  let vaultAccount = VaultAccount.load(vaultAccountID);
  if (vaultAccount == null) {
    let depositors = vault.depositors;
    depositors.push(accountAddress);
    vault.depositors = depositors;

    vault.numDepositors = vault.numDepositors + 1;
    vault.save();

    vaultAccount = new VaultAccount(vaultAccountID);
    vaultAccount.vault = vaultAddress.toHexString();
    vaultAccount.account = accountAddress;
    vaultAccount.totalDeposits = BigInt.fromI32(0);
    vaultAccount.totalBalance = BigInt.fromI32(0);
    vaultAccount.totalYieldEarned = BigInt.fromI32(0);
    vaultAccount.updateCounter = 0;
    vaultAccount.save();
  }
  return vaultAccount as VaultAccount;
}

export function getOrCreateLiquidityMiningPoolAccount(
  poolAddress: Address,
  accountAddress: Address,
  pool: VaultLiquidityMiningPool
): VaultLiquidityMiningPoolAccount {
  let poolAccountID =
    poolAddress.toHexString() + "-" + accountAddress.toHexString();

  let poolAccount = VaultLiquidityMiningPoolAccount.load(poolAccountID);
  if (poolAccount == null) {
    let depositors = pool.depositors;
    depositors.push(accountAddress);
    pool.depositors = depositors;

    pool.numDepositors = pool.numDepositors + 1;
    pool.save();

    poolAccount = new VaultLiquidityMiningPoolAccount(poolAccountID);
    poolAccount.pool = poolAddress.toHexString();
    poolAccount.account = accountAddress;
    poolAccount.totalRewardClaimed = BigInt.fromI32(0);
    poolAccount.totalBalance = BigInt.fromI32(0);
    poolAccount.save();
  }
  return poolAccount as VaultLiquidityMiningPoolAccount;
}

export function getOrCreateTokenAccount(
  tokenAddress: Address,
  accountAddress: Address,
  token: ERC20Token
): ERC20TokenAccount {
  let tokenAccountID =
    tokenAddress.toHexString() + "-" + accountAddress.toHexString();

  let tokenAccount = ERC20TokenAccount.load(tokenAccountID);
  if (tokenAccount == null) {
    let holders = token.holders;
    holders.push(accountAddress);
    token.holders = holders;

    token.numHolders = token.numHolders + 1;
    token.save();

    tokenAccount = new ERC20TokenAccount(tokenAccountID);
    tokenAccount.token = tokenAddress.toHexString();
    tokenAccount.account = accountAddress;
    tokenAccount.balance = BigInt.fromI32(0);
    tokenAccount.save();
  }
  return tokenAccount as ERC20TokenAccount;
}
