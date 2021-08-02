import { Address } from "@graphprotocol/graph-ts";
import {
  Harvested,
  YearnStrategyHarvest
} from "../generated/YearnStrategy/YearnStrategyHarvest";
import { refreshAllAccountBalances } from "./accounts";
import { getThetaVaultFromYearnStrategy } from "./data/constant";

export function handleUpdateReward(event: Harvested): void {
  let yearnVault = YearnStrategyHarvest.bind(event.address);
  let vaultAddress = getThetaVaultFromYearnStrategy(yearnVault.name());

  refreshAllAccountBalances(
    Address.fromString(vaultAddress),
    event.block.timestamp.toI32()
  );
}
