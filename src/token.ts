import { Address, BigInt } from "@graphprotocol/graph-ts";
import { ERC20, Transfer } from "../generated/RibbonToken/ERC20";
import { ERC20Token, ERC20TokenAccount } from "../generated/schema";
import { getOrCreateTokenAccount } from "./accounts";

function getOrCreateToken(tokenAddress: string): ERC20Token {
  let pool = ERC20Token.load(tokenAddress);

  if (pool == null) {
    pool = new ERC20Token(tokenAddress);
    let tokenContract = ERC20.bind(Address.fromString(tokenAddress));
    pool.name = tokenContract.name();
    pool.symbol = tokenContract.symbol();
    pool.numHolders = 0;
    pool.holders = [];
    pool.totalSupply = tokenContract.totalSupply();
    pool.save();
  }
  return pool as ERC20Token;
}

function updateTokenAccountBalance(
  tokenAddress: Address,
  userAddress: Address,
  tokenAccount: ERC20TokenAccount
): void {
  let tokenContract = ERC20.bind(tokenAddress);

  let callResult = tokenContract.try_balanceOf(userAddress);

  if (!callResult.reverted) {
    tokenAccount.balance = callResult.value;
    tokenAccount.save();
  }
}

export function handleTransfer(event: Transfer): void {
  let tokenAddress = event.address.toHexString();
  let token = getOrCreateToken(tokenAddress);
  let senderTokenAccount = getOrCreateTokenAccount(
    event.address,
    event.params.from,
    token
  );
  let receiverTokenAccount = getOrCreateTokenAccount(
    event.address,
    event.params.to,
    token
  );

  updateTokenAccountBalance(
    event.address,
    event.params.from,
    senderTokenAccount
  );
  updateTokenAccountBalance(
    event.address,
    event.params.to,
    receiverTokenAccount
  );
}
