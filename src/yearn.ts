import { Address } from "@graphprotocol/graph-ts";
import { UpdateRewards, YearnVault } from "../generated/yvUSDC/YearnVault";
import { refreshAllAccountBalances } from "./accounts";
import { getThetaVaultFromYearn } from "./data/constant";

export function handleUpdateReward(event: UpdateRewards): void {
  let yearnVault = YearnVault.bind(event.address);
  let vaultAddress = getThetaVaultFromYearn(yearnVault.symbol());

  refreshAllAccountBalances(
    Address.fromString(vaultAddress),
    event.block.timestamp.toI32()
  );
}
