import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  OpenShort,
  CloseShort,
  Deposit,
  Withdraw,
  Transfer,
  CapSet,
  InitiateGnosisAuction,
} from "../generated/RibbonETHCoveredCall/RibbonThetaVault";
import {
  Vault,
  VaultShortPosition,
  GnosisAuction,
  VaultOptionTrade,
  VaultTransaction
} from "../generated/schema";
import { RibbonThetaVault } from "../generated/RibbonETHCoveredCall/RibbonThetaVault";
import { Otoken } from "../generated/RibbonETHCoveredCall/Otoken";
import { AuctionCleared } from "../generated/GnosisAuction/GnosisAuction";

import {
  createVaultAccount,
  refreshAllAccountBalances,
  triggerBalanceUpdate
} from "./accounts";
import { isMiningPool } from "./data/constant";
import { getOtokenMintAmount } from "./utils";


function newVault(vaultAddress: string): Vault {
  let vault = new Vault(vaultAddress);
  let optionsVaultContract = RibbonThetaVault.bind(
    Address.fromString(vaultAddress)
  );
  let vaultParams = optionsVaultContract.vaultParams();
  let underlyingAddress = vaultParams[4]; //underlying asset
  let otoken = Otoken.bind(Address.fromString(underlyingAddress));

  vault.name = optionsVaultContract.name();
  vault.symbol = optionsVaultContract.symbol();
  vault.numDepositors = 0;
  vault.depositors = [];
  vault.totalPremiumEarned = BigInt.fromI32(0);
  vault.cap = optionsVaultContract.cap();
  vault.totalBalance = optionsVaultContract.totalBalance();
  vault.underlyingAsset = Bytes.fromI32(underlyingAddress);
  vault.underlyingName = otoken.name();
  vault.underlyingSymbol = otoken.symbol();
  vault.underlyingDecimals = otoken.decimals();
  return vault;
}

export function handleOpenShort(event: OpenShort): void {
  let optionAddress = event.params.options;

  let shortPosition = new VaultShortPosition(optionAddress.toHexString());

  let otoken = Otoken.bind(optionAddress);
  shortPosition.expiry = otoken.expiryTimestamp();
  let strikePrice = otoken.strikePrice();
  let isPut = otoken.isPut();
  shortPosition.strikePrice = strikePrice;

  let collateral = Otoken.bind(otoken.collateralAsset());
  let collateralDecimals = collateral.decimals() as u8;

  let vaultAddress = event.address.toHexString();
  shortPosition.vault = vaultAddress;
  shortPosition.option = optionAddress;
  shortPosition.depositAmount = event.params.depositAmount;
  shortPosition.mintAmount = getOtokenMintAmount(
    event.params.depositAmount,
    strikePrice,
    collateralDecimals,
    isPut
  );
  shortPosition.initiatedBy = event.params.manager;
  shortPosition.openedAt = event.block.timestamp;
  shortPosition.premiumEarned = BigInt.fromI32(0);
  shortPosition.openTxhash = event.transaction.hash;

  shortPosition.save();
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

// Used for mapping of AuctionCleared to RibbonVault
export function handleInitiateGnosisAuction(event: InitiateGnosisAuction): void {
  let auctionID = event.params.auctionCounter;
  let optionToken = event.params.auctioningToken;

  let auction = new GnosisAuction(auctionID.toHexString());
  auction.optionToken = optionToken;
  auction.save()
}

export function handleAuctionCleared(event: AuctionCleared): void {
  let auctionID = event.params.auctionId
  let auction = GnosisAuction.load(auctionID.toHexString())
  let optionToken = auction.optionToken;
  let shortPosition = VaultShortPosition.load(optionToken.toHexString());
  let vault = Vault.load(shortPosition.vault);


  if (shortPosition == null) {
    return;
  }
  if (vault == null) {
    return;
  }

  let tradeID =
    optionToken.toHexString() +
    "-" +
    event.transaction.hash.toHexString() +
    "-" +
    event.transactionLogIndex.toString();

  let optionsSold = event.params.soldAuctioningTokens;
  let totalPremium = event.params.soldBiddingTokens;

  let optionTrade = new VaultOptionTrade(tradeID);
  optionTrade.vault = shortPosition.vault;

  optionTrade.sellAmount = optionsSold;
  optionTrade.premium = totalPremium;

  optionTrade.vaultShortPosition = optionToken.toHexString();
  optionTrade.timestamp = event.block.timestamp;
  optionTrade.txhash = event.transaction.hash;
  optionTrade.save();

  shortPosition.premiumEarned = shortPosition.premiumEarned.plus(totalPremium);
  shortPosition.save();

  vault.totalPremiumEarned = vault.totalPremiumEarned.plus(totalPremium);
  vault.save();

  refreshAllAccountBalances(Address.fromString(vault.id), event.block.timestamp.toI32());
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

  let vaultAccount = createVaultAccount(event.address, event.params.account);
  vaultAccount.totalDeposits =
    vaultAccount.totalDeposits - event.params.amount;
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
  );

  triggerBalanceUpdate(
    event.address,
    event.params.account,
    event.block.timestamp.toI32(),
    false,
    true
  );
}

/**
 * We have two types of transfer
 *
 * Liquidity Mining
 * In liquidity mining, we keep track of the amount as shares, and underlying as actual underlying amount
 *
 * Normal transfer
 * We will store both underlying and amount as asset amount. In this case, the user transfer "underlying" instead of shares.
 */
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

  /**
   * Calculate underlying amount
   * Staking: To be able to calculate USD value that had been staked
   * Transfer: Transfer are always in the unit of underlying
   */
  let vaultContract = RibbonThetaVault.bind(event.address);
  let underlyingAmount =
    (event.params.value * vaultContract.totalBalance()) /
    vaultContract.totalSupply();

  /**
   * Record sender deposit/withdraw amount
   */
  let senderVaultAccount = createVaultAccount(event.address, event.params.from);
  switch (type as u32) {
    case "stake" as u32:
      senderVaultAccount.totalStakedShares =
        senderVaultAccount.totalStakedShares + event.params.value;
      break;
    default:
      senderVaultAccount.totalDeposits =
        senderVaultAccount.totalDeposits - underlyingAmount;
  }
  senderVaultAccount.save();

  newTransaction(
    txid + "-T", // Indicate transfer
    type == "stake" ? "stake" : "transfer",
    vaultAddress,
    event.params.from,
    event.transaction.hash,
    event.block.timestamp,
    type == "stake" ? event.params.value : underlyingAmount,
    underlyingAmount,
  );

  /**
   * Record receiver deposit/withdraw amount
   */
  let receiverVaultAccount = createVaultAccount(event.address, event.params.to);
  switch (type as u32) {
    case "unstake" as u32:
      receiverVaultAccount.totalStakedShares =
        receiverVaultAccount.totalStakedShares - event.params.value;
      break;
    default:
      receiverVaultAccount.totalDeposits =
        receiverVaultAccount.totalDeposits + underlyingAmount;
  }
  receiverVaultAccount.save();

  newTransaction(
    txid + "-R", // Indicate receive
    type == "unstake" ? "unstake" : "receive",
    vaultAddress,
    event.params.to,
    event.transaction.hash,
    event.block.timestamp,
    type == "unstake" ? event.params.value : underlyingAmount,
    underlyingAmount,
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
): void {
  let transaction = new VaultTransaction(txid);
  transaction.type = type;
  transaction.vault = vaultAddress;
  transaction.address = account;
  transaction.txhash = txhash;
  transaction.timestamp = timestamp;
  transaction.amount = amount;
  transaction.underlyingAmount = underlyingAmount || amount;
  transaction.save();
}

export function handleCapSet(event: CapSet): void {
  let vault = Vault.load(event.address.toHexString());
  if (vault != null) {
    vault.cap = event.params.newCap;
    vault.save();
  }
}
