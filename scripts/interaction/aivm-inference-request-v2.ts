import { network } from "hardhat";

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing ${name}`);
  }
  return value.trim();
}

function detConfigString(): string {
  // Must match `PoI-Consensus/consensus-go/cmd/aivm-worker` detConfigString().
  return "engine=ollama;temperature=0;top_p=1;stream=false;seed=0;";
}

function toBytes32HexFromOllamaDigest(digest: string): string {
  const d = digest.trim();
  const prefix = "sha256:";
  if (!d.startsWith(prefix)) {
    throw new Error(`Unexpected ollama digest format: ${d}`);
  }
  const hex = d.slice(prefix.length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(`Unexpected sha256 hex: ${hex}`);
  }
  return "0x" + hex.toLowerCase();
}

async function getOllamaModelDigest(ollamaUrl: string, model: string): Promise<string> {
  const base = ollamaUrl.replace(/\/$/, "");
  const res = await fetch(base + "/api/tags");
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ollama /api/tags failed: status=${res.status} body=${text}`);
  }
  const parsed = JSON.parse(text) as { models?: Array<{ name: string; digest: string }> };
  const models = parsed.models || [];

  const candidates = [model];
  if (!model.includes(":")) candidates.push(model + ":latest");

  for (const m of models) {
    for (const c of candidates) {
      if ((m.name || "").trim().toLowerCase() === c.trim().toLowerCase()) {
        return toBytes32HexFromOllamaDigest(m.digest);
      }
    }
  }
  throw new Error(`model not found in /api/tags: ${model}`);
}

async function storePrompt(
  coordinatorHttp: string,
  bearer: string | undefined,
  prompt: string,
  promptHash: string
): Promise<{ prompt_id: string; prompt_hash: string }> {
  const endpoint = coordinatorHttp.replace(/\/$/, "") + "/aivm/prompts";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearer && bearer.trim().length > 0) {
    headers["Authorization"] = `Bearer ${bearer.trim()}`;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt, prompt_hash: promptHash }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`prompt store failed: status=${res.status} body=${text}`);
  }
  const parsed = JSON.parse(text) as { prompt_id: string; prompt_hash: string };
  return parsed;
}

async function main() {
  const { ethers } = await network.connect();
  const [signer] = await ethers.getSigners();

  const contractAddress =
    process.env.LCAI_TESTNET_V2_AIVM_INFERENCE_V2_ADDRESS ||
    process.env.AIVM_INFERENCE_V2_ADDRESS ||
    process.env.AIVM_INFERENCE_ADDRESS ||
    process.argv[2];
  const model = process.env.AIVM_MODEL || process.argv[3];
  const prompt = process.env.AIVM_PROMPT || process.argv[4];

  const coordinatorHttp =
    process.env.COORDINATOR_HTTP_URL ||
    process.env.AIVM_COORDINATOR_HTTP_URL ||
    "http://localhost:8081";
  const bearer =
    process.env.HTTP_BEARER_TOKEN ||
    process.env.COORDINATOR_HTTP_BEARER_TOKEN ||
    process.env.AIVM_COORDINATOR_HTTP_BEARER_TOKEN;

  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

  const addr = requireValue("AIVM inference v2 contract address", contractAddress);
  const modelId = requireValue("AIVM_MODEL (or argv[3])", model);
  const promptText = requireValue("AIVM_PROMPT (or argv[4])", prompt);

  const promptHash = ethers.keccak256(ethers.toUtf8Bytes(promptText));
  const stored = await storePrompt(coordinatorHttp, bearer, promptText, promptHash);

  const promptId = requireValue("prompt_id", stored.prompt_id);
  const storedHash = requireValue("prompt_hash", stored.prompt_hash);
  if (storedHash.toLowerCase() !== promptHash.toLowerCase()) {
    throw new Error(`coordinator returned prompt_hash mismatch: want=${promptHash} got=${storedHash}`);
  }

  const modelDigest =
    process.env.AIVM_MODEL_DIGEST ||
    process.env.AIVM_MODEL_DIGEST_SHA256 ||
    (await getOllamaModelDigest(ollamaUrl, modelId));

  const detCfg = process.env.AIVM_DET_CONFIG || detConfigString();
  const detConfigHash = ethers.keccak256(ethers.toUtf8Bytes(detCfg));

  const feeWeiRaw = process.env.AIVM_REQUEST_FEE_WEI;
  const feeEthRaw = process.env.AIVM_REQUEST_FEE_ETH;
  const feeWei =
    feeWeiRaw && feeWeiRaw.trim().length > 0
      ? BigInt(feeWeiRaw.trim())
      : feeEthRaw && feeEthRaw.trim().length > 0
        ? ethers.parseEther(feeEthRaw.trim())
        : 0n;

  console.log("🧠 Submitting inference request (v2)...");
  console.log("Contract:", addr);
  console.log("From:", signer.address);
  console.log("Model:", modelId);
  console.log("ModelDigest:", modelDigest);
  console.log("DetConfigHash:", detConfigHash);
  console.log("PromptHash:", promptHash);
  console.log("PromptId:", promptId);
  console.log("Coordinator:", coordinatorHttp);

  const c = await ethers.getContractAt("AIVMInferenceV2", addr, signer);
  const tx = await c.requestInferenceV2(modelId, promptHash, promptId, modelDigest, detConfigHash, {
    value: feeWei,
  });
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("No receipt");

  for (const log of receipt.logs) {
    try {
      const parsed = c.interface.parseLog(log);
      if (parsed?.name !== "InferenceRequestedV2") continue;
      const requestId = parsed.args.requestId as bigint;
      const taskId = parsed.args.taskId as string;
      console.log("✅ InferenceRequestedV2");
      console.log("requestId=", requestId.toString());
      console.log("taskId=", taskId);
      console.log("promptId=", promptId);
      console.log("promptHash=", promptHash);
      return;
    } catch {
      // ignore
    }
  }

  throw new Error("InferenceRequestedV2 event not found in receipt logs");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

