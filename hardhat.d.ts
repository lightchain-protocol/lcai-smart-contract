// Type augmentation for Hardhat config to include explorer property
import "hardhat/types/config";

declare module "hardhat/types/config" {
  interface HttpNetworkUserConfig {
    name?: string;
    chainId?: number;
    url?: string;
    explorer?: {
      name?: string;
      url: string;
    };
  }

  interface HardhatNetworkUserConfig {
    name?: string;
    url?: string;
    explorer?: {
      name?: string;
      url: string;
    };
  }

  interface EdrNetworkUserConfig {
    name?: string;
    url?: string;
    explorer?: {
      name?: string;
      url: string;
    };
  }
}

