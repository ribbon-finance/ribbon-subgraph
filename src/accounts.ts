import { BigInt, Address, log } from "@graphprotocol/graph-ts";
import { RibbonOptionsVault } from "../generated/RibbonOptionsVault/RibbonOptionsVault";
import { BalanceUpdate, Vault, VaultAccount } from "../generated/schema";

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
          true
        );
      }
    }
  }
}

export function triggerBalanceUpdate(
  vaultAddress: Address,
  accountAddress: Address,
  timestamp: i32,
  accruesYield: bool
): void {
  let vaultID = vaultAddress.toHexString();

  let vaultContract = RibbonOptionsVault.bind(vaultAddress);

  let vaultAccount = VaultAccount.load(
    vaultAddress.toHexString() + "-" + accountAddress.toHexString()
  );

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
    vaultAccount.totalYieldEarned = BigInt.fromI32(0);
    vaultAccount.updateCounter = 0;
    vaultAccount.save();
  }
  return vaultAccount as VaultAccount;
}
