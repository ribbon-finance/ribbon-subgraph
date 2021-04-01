import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  OpenShort,
  CloseShort,
  Deposit,
  Withdraw
} from "../generated/RibbonOptionsVault/RibbonOptionsVault";
import {
  Vault,
  VaultShortPosition,
  VaultOptionTrade,
  VaultTransaction
} from "../generated/schema";
import { RibbonOptionsVault } from "../generated/RibbonOptionsVault/RibbonOptionsVault";
import { Otoken } from "../generated/RibbonOptionsVault/Otoken";
import { Swap } from "../generated/Airswap/Airswap";

import { createVaultAccount, triggerBalanceUpdate } from "./accounts";

export function handleOpenShort(event: OpenShort): void {
  let optionAddress = event.params.options;

  let shortPosition = new VaultShortPosition(optionAddress.toHex());

  if (event.transaction.to == null) {
    return;
  }

  let vaultAddress = event.transaction.to.toHex();
  shortPosition.vault = vaultAddress;
  shortPosition.option = optionAddress;
  shortPosition.depositAmount = event.params.depositAmount;
  shortPosition.initiatedBy = event.params.manager;
  shortPosition.openedAt = event.block.timestamp;
  shortPosition.premiumEarned = BigInt.fromI32(0);

  let otoken = Otoken.bind(optionAddress);
  shortPosition.expiry = otoken.expiryTimestamp();
  shortPosition.strikePrice = otoken.strikePrice();

  shortPosition.save();
}

function newVault(vaultAddress: string): Vault {
  let vault = new Vault(vaultAddress);
  let optionsVaultContract = RibbonOptionsVault.bind(
    Address.fromString(vaultAddress)
  );
  vault.name = optionsVaultContract.name();
  vault.symbol = optionsVaultContract.symbol();
  vault.numDepositors = 0;
  vault.totalPremiumEarned = BigInt.fromI32(0);
  vault.totalWithdrawalFee = BigInt.fromI32(0);
  return vault;
}

export function handleCloseShort(event: CloseShort): void {
  let shortPosition = VaultShortPosition.load(event.params.options.toHex());
  if (shortPosition != null) {
    shortPosition.closedAt = event.block.timestamp;
    shortPosition.save();
  }
}

export function handleSwap(event: Swap): void {
  let optionToken = event.params.signerToken;
  let vaultAddress = event.params.signerWallet;

  let shortPosition = VaultShortPosition.load(optionToken.toHex());
  let vault = Vault.load(vaultAddress.toHex());

  if (shortPosition == null) {
    return;
  }
  if (vault == null) {
    return;
  }

  let swapID =
    optionToken.toHex() +
    "-" +
    event.transaction.hash.toHex() +
    "-" +
    event.transactionLogIndex.toString();
  let premium = event.params.senderAmount;

  let optionTrade = new VaultOptionTrade(swapID);
  optionTrade.vault = vaultAddress.toHex();
  optionTrade.buyer = event.params.senderWallet;
  optionTrade.sellAmount = event.params.signerAmount;
  optionTrade.premium = event.params.senderAmount;
  optionTrade.optionToken = event.params.signerToken;
  optionTrade.premiumToken = event.params.senderToken;
  optionTrade.vaultShortPosition = optionToken.toHex();
  optionTrade.timestamp = event.block.timestamp;
  optionTrade.txhash = event.transaction.hash;
  optionTrade.save();

  shortPosition.premiumEarned = shortPosition.premiumEarned.plus(premium);
  shortPosition.save();

  vault.totalPremiumEarned = vault.totalPremiumEarned.plus(premium);
  vault.save();
}

export function handleDeposit(event: Deposit): void {
  if (event.transaction.to == null) {
    return;
  }
  let vaultAddress = event.transaction.to.toHex();
  let vault = Vault.load(vaultAddress);

  if (vault == null) {
    vault = newVault(vaultAddress);
    vault.save();
  }

  createVaultAccount(event.transaction.to as Address, event.params.account);

  let txid =
    vaultAddress +
    "-" +
    event.transaction.hash.toHex() +
    "-" +
    event.transactionLogIndex.toString();

  newTransaction(
    txid,
    "deposit",
    vaultAddress,
    event.params.account,
    event.transaction.hash,
    event.block.timestamp,
    event.params.amount,
    BigInt.fromI32(0) // zero fees on deposit
  );

  triggerBalanceUpdate(
    event.transaction.to as Address,
    event.params.account,
    event.block.timestamp.toI32()
  );
}

export function handleWithdraw(event: Withdraw): void {
  if (event.transaction.to == null) {
    return;
  }

  let vaultAddress = event.transaction.to.toHex();
  let vault = Vault.load(vaultAddress);

  if (vault == null) {
    vault = newVault(vaultAddress);
    vault.save();
  }

  let txid =
    vaultAddress +
    "-" +
    event.transaction.hash.toHex() +
    "-" +
    event.transactionLogIndex.toString();

  newTransaction(
    txid,
    "withdraw",
    vaultAddress,
    event.params.account,
    event.transaction.hash,
    event.block.timestamp,
    event.params.amount,
    event.params.fee
  );

  triggerBalanceUpdate(
    event.transaction.to as Address,
    event.params.account,
    event.block.timestamp.toI32()
  );
}

function newTransaction(
  txid: string,
  type: string,
  vaultAddress: string,
  account: Address,
  txhash: Bytes,
  timestamp: BigInt,
  amount: BigInt,
  fee: BigInt
): void {
  let transaction = new VaultTransaction(txid);
  transaction.type = type;
  transaction.vault = vaultAddress;
  transaction.address = account;
  transaction.txhash = txhash;
  transaction.timestamp = timestamp;
  transaction.amount = amount;
  transaction.fee = fee;
  transaction.save();
}
