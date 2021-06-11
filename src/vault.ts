import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  OpenShort,
  CloseShort,
  Deposit,
  Withdraw,
  Transfer,
  CapSet
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

import {
  createVaultAccount,
  refreshAllAccountBalances,
  triggerBalanceUpdate
} from "./accounts";
import { isMiningPool } from "./data/constant";

export function handleOpenShort(event: OpenShort): void {
  let optionAddress = event.params.options;

  let shortPosition = new VaultShortPosition(optionAddress.toHexString());

  let vaultAddress = event.address.toHexString();
  shortPosition.vault = vaultAddress;
  shortPosition.option = optionAddress;
  shortPosition.depositAmount = event.params.depositAmount;
  shortPosition.initiatedBy = event.params.manager;
  shortPosition.openedAt = event.block.timestamp;
  shortPosition.premiumEarned = BigInt.fromI32(0);
  shortPosition.openTxhash = event.transaction.hash;

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
  vault.depositors = [];
  vault.totalPremiumEarned = BigInt.fromI32(0);
  vault.totalWithdrawalFee = BigInt.fromI32(0);
  vault.cap = optionsVaultContract.cap();
  vault.totalBalance = optionsVaultContract.totalBalance();
  return vault;
}

export function handleCloseShort(event: CloseShort): void {
  let vaultAddress = event.address;
  let shortPosition = VaultShortPosition.load(
    event.params.options.toHexString()
  );
  if (shortPosition != null) {
    let loss = shortPosition.depositAmount - event.params.withdrawAmount;
    shortPosition.loss = loss;
    shortPosition.withdrawAmount = event.params.withdrawAmount;
    shortPosition.isExercised = loss > BigInt.fromI32(0);
    shortPosition.closedAt = event.block.timestamp;
    shortPosition.closeTxhash = event.transaction.hash;
    shortPosition.save();

    refreshAllAccountBalances(vaultAddress, event.block.timestamp.toI32());
  }
}

export function handleSwap(event: Swap): void {
  let optionToken = event.params.senderToken;
  let vaultAddress = event.params.senderWallet;

  let shortPosition = VaultShortPosition.load(optionToken.toHexString());
  let vault = Vault.load(vaultAddress.toHexString());

  if (shortPosition == null) {
    return;
  }
  if (vault == null) {
    return;
  }

  let swapID =
    optionToken.toHexString() +
    "-" +
    event.transaction.hash.toHexString() +
    "-" +
    event.transactionLogIndex.toString();
  let premium = event.params.signerAmount;

  let optionTrade = new VaultOptionTrade(swapID);
  optionTrade.vault = vaultAddress.toHexString();
  optionTrade.buyer = event.params.signerWallet;
  optionTrade.sellAmount = event.params.senderAmount;
  optionTrade.premium = event.params.signerAmount;
  optionTrade.optionToken = event.params.senderToken;
  optionTrade.premiumToken = event.params.signerToken;
  optionTrade.vaultShortPosition = optionToken.toHexString();
  optionTrade.timestamp = event.block.timestamp;
  optionTrade.txhash = event.transaction.hash;
  optionTrade.save();

  shortPosition.premiumEarned = shortPosition.premiumEarned.plus(premium);
  shortPosition.save();

  vault.totalPremiumEarned = vault.totalPremiumEarned.plus(premium);
  vault.save();

  refreshAllAccountBalances(vaultAddress, event.block.timestamp.toI32());
}

export function handleDeposit(event: Deposit): void {
  let vaultAddress = event.address.toHexString();
  let vault = Vault.load(vaultAddress);

  if (vault == null) {
    vault = newVault(vaultAddress);
    vault.save();
  }

  let vaultAccount = createVaultAccount(event.address, event.params.account);
  vaultAccount.totalDeposits = vaultAccount.totalDeposits + event.params.amount;
  vaultAccount.save();

  let txid =
    vaultAddress +
    "-" +
    event.transaction.hash.toHexString() +
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
    event.params.amount,
    BigInt.fromI32(0) // zero fees on deposit
  );

  triggerBalanceUpdate(
    event.address,
    event.params.account,
    event.block.timestamp.toI32(),
    false,
    false
  );
}

export function handleWithdraw(event: Withdraw): void {
  let vaultAddress = event.address.toHexString();
  let vault = Vault.load(vaultAddress);

  if (vault == null) {
    vault = newVault(vaultAddress);
    vault.save();
  }

  vault.totalWithdrawalFee = vault.totalWithdrawalFee + event.params.fee;
  vault.save();

  let vaultAccount = createVaultAccount(event.address, event.params.account);
  vaultAccount.totalDeposits =
    vaultAccount.totalDeposits - event.params.amount - event.params.fee;
  vaultAccount.save();

  let txid =
    vaultAddress +
    "-" +
    event.transaction.hash.toHexString() +
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
    event.params.amount,
    event.params.fee
  );

  triggerBalanceUpdate(
    event.address,
    event.params.account,
    event.block.timestamp.toI32(),
    false,
    true
  );
}

export function handleTransfer(event: Transfer): void {
  // Just skip if it's a new deposit or withdrawal
  if (
    event.params.from.toHexString() ==
      "0x0000000000000000000000000000000000000000" ||
    event.params.to.toHexString() ==
      "0x0000000000000000000000000000000000000000"
  ) {
    return;
  }

  let type = "transfer";

  if (isMiningPool(event.params.to)) {
    type = "stake";
  } else if (isMiningPool(event.params.from)) {
    type = "unstake";
  }

  let vaultAddress = event.address.toHexString();
  let txid =
    vaultAddress +
    "-" +
    event.transaction.hash.toHexString() +
    "-" +
    event.transactionLogIndex.toString();

  let senderVaultAccount = createVaultAccount(event.address, event.params.from);

  switch (type as u32) {
    case "stake" as u32:
      senderVaultAccount.totalStakedShares =
        senderVaultAccount.totalStakedShares + event.params.value;
      break;
    default:
      senderVaultAccount.totalDeposits =
        senderVaultAccount.totalDeposits - event.params.value;
  }
  senderVaultAccount.save();

  /**
   * Calculate underlying amount
   */
  let underlyingAmount = event.params.value;
  if (type === "stake" || type === "unstake") {
    const vaultContract = RibbonOptionsVault.bind(event.address);
    underlyingAmount =
      (event.params.value * vaultContract.totalBalance()) /
      vaultContract.totalSupply();
  }

  newTransaction(
    txid + "-T", // Indicate transfer
    type === "stake" ? "stake" : "transfer",
    vaultAddress,
    event.params.from,
    event.transaction.hash,
    event.block.timestamp,
    event.params.value,
    underlyingAmount,
    BigInt.fromI32(0) // zero fees on transfer
  );

  let receiverVaultAccount = createVaultAccount(event.address, event.params.to);

  switch (type as u32) {
    case "unstake" as u32:
      receiverVaultAccount.totalStakedShares =
        receiverVaultAccount.totalStakedShares - event.params.value;
      break;
    default:
      receiverVaultAccount.totalDeposits =
        receiverVaultAccount.totalDeposits + event.params.value;
  }
  receiverVaultAccount.save();

  newTransaction(
    txid + "-R", // Indicate receive
    type === "unstake" ? "unstake" : "receive",
    vaultAddress,
    event.params.to,
    event.transaction.hash,
    event.block.timestamp,
    event.params.value,
    underlyingAmount,
    BigInt.fromI32(0) // zero fees on transfer
  );

  triggerBalanceUpdate(
    event.address,
    event.params.from,
    event.block.timestamp.toI32(),
    false,
    true
  );
  triggerBalanceUpdate(
    event.address,
    event.params.to,
    event.block.timestamp.toI32(),
    false,
    false
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
  underlyingAmount: BigInt,
  fee: BigInt
): void {
  let transaction = new VaultTransaction(txid);
  transaction.type = type;
  transaction.vault = vaultAddress;
  transaction.address = account;
  transaction.txhash = txhash;
  transaction.timestamp = timestamp;
  transaction.amount = amount;
  transaction.underlyingAmount = underlyingAmount || amount;
  transaction.fee = fee;
  transaction.save();
}

export function handleCapSet(event: CapSet): void {
  let vault = Vault.load(event.address.toHexString());
  if (vault != null) {
    vault.cap = event.params.newCap;
    vault.save();
  }
}
