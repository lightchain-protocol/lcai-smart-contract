import fs from "fs";
import path from "path";

export interface DeploymentAddresses {
  timelock?: string;
  governor?: string;
  treasury?: string;
  chatUtility?: string;
  chatSubscription?: string;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ENV_ADDRESS_KEYS: Record<keyof DeploymentAddresses, string> = {
  timelock: "LCAI_TESTNET_V2_TIMELOCK_ADDRESS",
  governor: "LCAI_TESTNET_V2_GOVERNOR_ADDRESS",
  treasury: "LCAI_TESTNET_V2_TREASURY_ADDRESS",
  chatUtility: "LCAI_TESTNET_V2_CHAT_UTILITY_ADDRESS",
  chatSubscription: "LCAI_TESTNET_V2_CHAT_SUBSCRIPTION_ADDRESS",
};

export function syncDeploymentArtifacts(
  projectRoot: string,
  networkName: string,
  addresses: DeploymentAddresses
): void {
  if (networkName !== "lcai_testnet_v2") {
    return;
  }

  const normalizedAddresses = normalizeAddresses(addresses);

  updateGenesis(projectRoot, normalizedAddresses);
  updateConsensus(projectRoot, normalizedAddresses);
  updateEnv(projectRoot, normalizedAddresses);
}

function normalizeAddresses(addresses: DeploymentAddresses): DeploymentAddresses {
  const entries = Object.entries(addresses) as [keyof DeploymentAddresses, string | undefined][];
  const result: DeploymentAddresses = {};

  for (const [key, value] of entries) {
    if (value && value !== ZERO_ADDRESS) {
      result[key] = value;
    }
  }

  return result;
}

function updateGenesis(projectRoot: string, addresses: DeploymentAddresses) {
  if (Object.keys(addresses).length === 0) {
    return;
  }

  const genesisPath = path.resolve(
    projectRoot,
    "..",
    "lcai-testnet-v2",
    "genesis",
    "genesis_v2.json"
  );

  if (!fs.existsSync(genesisPath)) {
    console.warn(`⚠️  genesis_v2.json not found at ${genesisPath}; skipping update.`);
    return;
  }

  try {
    const genesisRaw = fs.readFileSync(genesisPath, "utf8");
    const genesisJson = JSON.parse(genesisRaw);
    genesisJson.contracts = genesisJson.contracts || {};

    if (addresses.governor) {
      genesisJson.contracts.dao = addresses.governor;
    }
    if (addresses.treasury) {
      genesisJson.contracts.treasury = addresses.treasury;
    }
    if (addresses.chatUtility) {
      genesisJson.contracts.chat_utility = addresses.chatUtility;
    }
    if (addresses.timelock) {
      genesisJson.contracts.timelock = addresses.timelock;
    }
    if (addresses.chatSubscription) {
      genesisJson.contracts.chat_subscription = addresses.chatSubscription;
    }

    fs.writeFileSync(genesisPath, JSON.stringify(genesisJson, null, 2));
    console.log(`📄 Updated genesis contracts in ${genesisPath}`);
  } catch (error) {
    console.warn(`⚠️  Failed to update genesis file: ${(error as Error).message}`);
  }
}

function updateConsensus(projectRoot: string, addresses: DeploymentAddresses) {
  if (Object.keys(addresses).length === 0) {
    return;
  }

  const consensusPath = path.resolve(
    projectRoot,
    "..",
    "lcai-testnet-v2",
    "network",
    "rpc",
    "config",
    "consensus.yaml"
  );

  if (!fs.existsSync(consensusPath)) {
    console.warn(`⚠️  consensus.yaml not found at ${consensusPath}; skipping update.`);
    return;
  }

  try {
    let consensusRaw = fs.readFileSync(consensusPath, "utf8");

    consensusRaw = replaceYamlAddress(consensusRaw, "governor_address", addresses.governor);
    consensusRaw = replaceYamlAddress(consensusRaw, "chat_utility_address", addresses.chatUtility);
    consensusRaw = replaceYamlAddress(consensusRaw, "treasury_address", addresses.treasury);
    consensusRaw = replaceYamlAddress(consensusRaw, "timelock_address", addresses.timelock);
    consensusRaw = replaceYamlAddress(
      consensusRaw,
      "chat_subscription_address",
      addresses.chatSubscription
    );

    fs.writeFileSync(consensusPath, consensusRaw);
    console.log(`📄 Updated consensus execution addresses in ${consensusPath}`);
  } catch (error) {
    console.warn(`⚠️  Failed to update consensus file: ${(error as Error).message}`);
  }
}

function replaceYamlAddress(content: string, key: string, value?: string): string {
  if (!value) {
    return content;
  }

  const regex = new RegExp(`(${key}\\s*:\\s*")([^"\n]*)(")`);

  if (!regex.test(content)) {
    return content;
  }

  return content.replace(regex, `$1${value}$3`);
}

function updateEnv(projectRoot: string, addresses: DeploymentAddresses) {
  if (Object.keys(addresses).length === 0) {
    return;
  }

  const envPath = path.resolve(projectRoot, ".env");

  if (!fs.existsSync(envPath)) {
    console.warn(
      "⚠️  No .env file found in the smart contract project root; skipping address sync."
    );
    return;
  }

  try {
    let envContent = fs.readFileSync(envPath, "utf8");

    for (const [key, envVar] of Object.entries(ENV_ADDRESS_KEYS)) {
      const address = addresses[key as keyof DeploymentAddresses];
      if (!address) {
        continue;
      }

      const envLine = `${envVar}=${address}`;
      const envRegex = new RegExp(`^${envVar}=.*$`, "m");

      if (envRegex.test(envContent)) {
        envContent = envContent.replace(envRegex, envLine);
      } else {
        envContent = envContent.replace(/\s*$/, "");
        envContent = `${envContent}\n${envLine}\n`;
      }
    }

    if (!envContent.endsWith("\n")) {
      envContent += "\n";
    }

    fs.writeFileSync(envPath, envContent);
    console.log(`📄 Updated address exports in ${envPath}`);
  } catch (error) {
    console.warn(`⚠️  Failed to update .env file: ${(error as Error).message}`);
  }
}
