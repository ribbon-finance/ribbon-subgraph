import { Address, Bytes, log } from "@graphprotocol/graph-ts";
import { RibbonOptionsVault } from "../generated/RibbonOptionsVault/RibbonOptionsVault";
import {
  BalanceUpdate,
  Account,
  Vault,
  VaultAccount
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
          timestamp
        );
      }
    }
  }
}

export function triggerBalanceUpdate(
  vaultAddress: Address,
  accountAddress: Address,
  timestamp: i32
): void {
  let vaultID = vaultAddress.toHexString();
  let updateID =
    vaultID + "-" + accountAddress.toHexString() + "-" + timestamp.toString();

  let vaultContract = RibbonOptionsVault.bind(vaultAddress);

  let account = Account.load(accountAddress.toHexString());
  if (account == null) {
    account.save();
  }

  let callResult = vaultContract.try_accountVaultBalance(accountAddress);

  if (!callResult.reverted) {
    let update = new BalanceUpdate(updateID);
    update.vault = vaultID;
    update.account = accountAddress.toHexString();
    update.timestamp = timestamp;
    update.balance = callResult.value;
    update.save();
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
): void {
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

    let account = new Account(accountAddress.toHexString());
    account.save();

    vaultAccount = new VaultAccount(vaultAccountID);
    vaultAccount.vault = vaultAddress.toHexString();
    vaultAccount.account = accountAddress.toHexString();
    vaultAccount.save();
  }
}
