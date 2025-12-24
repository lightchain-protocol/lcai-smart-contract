import { network } from "hardhat";

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing ${name}`);
  }
  return value.trim();
}

async function main() {
  const { ethers } = await network.connect();
  const [signer] = await ethers.getSigners();

  const contractAddress =
    process.env.LCAI_TESTNET_V2_AIVM_INFERENCE_ADDRESS ||
    process.env.AIVM_INFERENCE_ADDRESS ||
    process.argv[2];
  const model = process.env.AIVM_MODEL || process.argv[3];
  const prompt = process.env.AIVM_PROMPT || process.argv[4];

  const addr = requireValue("AIVM inference contract address", contractAddress);
  const modelId = requireValue("AIVM_MODEL (or argv[3])", model);
  const promptText = requireValue("AIVM_PROMPT (or argv[4])", prompt);

  console.log("🧠 Submitting inference request...");
  console.log("Contract:", addr);
  console.log("From:", signer.address);
  console.log("Model:", modelId);
  console.log("Prompt:", promptText);

  const c = await ethers.getContractAt("AIVMInference", addr, signer);
  const tx = await c.requestInference(modelId, promptText);
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error("No receipt");
  }

  for (const log of receipt.logs) {
    try {
      const parsed = c.interface.parseLog(log);
      if (parsed?.name !== "InferenceRequested") continue;
      const requestId = parsed.args.requestId as bigint;
      const promptHash = parsed.args.promptHash as string;
      console.log("✅ InferenceRequested");
      console.log("requestId=", requestId.toString());
      console.log("promptHash=", promptHash);
      return;
    } catch {
      // ignore
    }
  }

  throw new Error("InferenceRequested event not found in receipt logs");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

