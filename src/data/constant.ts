import { Address, dataSource } from "@graphprotocol/graph-ts";

export const isMiningPool = (address: Address): boolean => {
  let miningPoolAddresses: string[] =
    dataSource.network() == "mainnet"
      ? [
          "0xd46f9546ebAbAAC44DC1B6D0Ac1eeb357D34FBeB",
          "0x1d27a3A92330693B897db9B1C26290Ba381049b1",
          "0xe79734461499246b6A8C8e768B96bebd0C891f63"
        ]
      : [
          "0x79F653c6eD5e2054ee038F34A3cE7ecAa1d89084",
          "0x210139dAa8125155b64c69701df6f4E03EcF89f1",
          "0xd5707Abde5366a5c2b9B490faf1f1e07B734a0a7",
          "0xa8A4bb7254210aADa78493c3034405C4B3140052"
        ];

  // Graph-ts array type appear not to be iterable, so uses for loop instead
  for (let i = 0; i < miningPoolAddresses.length; i++) {
    if (Address.fromString(miningPoolAddresses[i]).equals(address)) {
      return true;
    }
  }

  return false;
};

export const getThetaVaultFromYearnStrategy = (name: string): string => {
  // Yearn USDC Vault Strategy
  if (
    name == "StrategyIdleidleUSDCYield" ||
    name == "StrategyGenericLevCompFarm" ||
    name == "PoolTogether USD Coin" ||
    name == "StrategyRook USD Coin" ||
    name == "StrategyAH2EarncyUSDC" ||
    name == "SingleSidedCrvUSDC"
  ) {
    return "0x8FE74471F198E426e96bE65f40EeD1F8BA96e54f";
  }

  return "";
};
