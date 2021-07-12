import { BigInt } from "@graphprotocol/graph-ts";

let WAD = BigInt.fromString("1000000000000000000");
let OTOKEN_DECIMALS = BigInt.fromString("100000000");
let SCALE_DECIMALS = BigInt.fromString("10000000000");

function wdiv(x: BigInt, y: BigInt): BigInt {
  return x
    .times(WAD)
    .plus(y.div(BigInt.fromI32(2)))
    .div(y);
}

export function getOtokenMintAmount(
  depositAmount: BigInt,
  strikePrice: BigInt,
  collateralDecimals: u8
): BigInt {
  return wdiv(
    depositAmount.times(OTOKEN_DECIMALS),
    strikePrice.times(SCALE_DECIMALS)
  ).div(BigInt.fromI32(10).pow(collateralDecimals));
}
