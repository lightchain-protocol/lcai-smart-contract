import { network } from "hardhat";

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing ${name}`);
  }
  return value.trim();
}

async function main() {
  const { ethers } = await network.connect();

  const contractAddress =
    process.env.LCAI_TESTNET_V2_AIVM_INFERENCE_ADDRESS ||
    process.env.AIVM_INFERENCE_ADDRESS ||
    process.argv[2];
  const requestIdRaw = process.env.AIVM_REQUEST_ID || process.argv[3];

  const coordinatorHttp =
    process.env.COORDINATOR_HTTP_URL ||
    process.env.AIVM_COORDINATOR_HTTP_URL ||
    "http://localhost:8081";
  const bearer =
    process.env.HTTP_BEARER_TOKEN ||
    process.env.COORDINATOR_HTTP_BEARER_TOKEN ||
    process.env.AIVM_COORDINATOR_HTTP_BEARER_TOKEN;
  const validatorId = process.env.AIVM_VALIDATOR_ID || "validator-1";
  const taskId = process.env.AIVM_TASK_ID;

  const addr = requireValue("AIVM inference contract address", contractAddress);
  const requestIdStr = requireValue("AIVM_REQUEST_ID (or argv[3])", requestIdRaw);
  const requestId = BigInt(requestIdStr);

  const c = await ethers.getContractAt("AIVMInference", addr);
  const latest = await ethers.provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - 5000);

  const logs = await c.queryFilter(
    c.filters.InferenceRequested(requestId),
    fromBlock,
    latest
  );
  if (logs.length === 0) {
    throw new Error(
      `InferenceRequested not found for requestId=${requestId.toString()} (searched ${fromBlock}..${latest})`
    );
  }

  const ev = logs[logs.length - 1];
  const model = ev.args.model as string;
  const promptHash = ev.args.promptHash as string;
  const prompt = ev.args.prompt as string;

  const effectiveTaskId = taskId || `aivm-${requestId.toString()}`;
  const endpoint = coordinatorHttp.replace(/\/$/, "") + "/enqueue-task";

  const body = {
    task_id: effectiveTaskId,
    validator_id: validatorId,
    payload: {
      request_id: requestId.toString(),
      contract_address: addr,
      model,
      prompt,
      prompt_hash: promptHash,
    },
  };

  console.log("🧺 Enqueueing coordinator task...");
  console.log("endpoint=", endpoint);
  console.log("task_id=", effectiveTaskId);
  console.log("validator_id=", validatorId);
  console.log("contract=", addr);
  console.log("request_id=", requestId.toString());

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearer && bearer.trim().length > 0) {
    headers["Authorization"] = `Bearer ${bearer.trim()}`;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`enqueue failed: status=${res.status} body=${text}`);
  }
  console.log("✅ Enqueued:", text);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
