// Type augmentation for Hardhat config to include explorer property
import "hardhat/types/config";

declare module "hardhat/types/config" {
  interface HttpNetworkUserConfig {
    explorer?: {
      name?: string;
      url: string;
    };
  }
}

