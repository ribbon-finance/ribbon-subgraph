import { Address } from "@graphprotocol/graph-ts";
import { RibbonOptionsVault } from "../generated/RibbonOptionsVault/RibbonOptionsVault";
import {
  BalanceUpdate,
  Account,
  Vault,
  VaultAccount
} from "../generated/schema";

// export function refreshAllAccountBalances(
//   vaultAddress: Address,
//   timestamp: number
// ): void {
//   let vault = Vault.load(vaultAddress.toHexString());

//   if (vault != null) {
//     vault.depositors;
//   }
// }

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

  let accountBalance = vaultContract.accountVaultBalance(accountAddress);

  let update = new BalanceUpdate(updateID);
  update.vault = vaultID;
  update.account = accountAddress.toHexString();
  update.timestamp = timestamp;
  update.balance = accountBalance;
  update.save();
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
