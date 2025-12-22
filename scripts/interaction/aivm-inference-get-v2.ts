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
    process.env.LCAI_TESTNET_V2_AIVM_INFERENCE_V2_ADDRESS ||
    process.env.AIVM_INFERENCE_V2_ADDRESS ||
    process.env.AIVM_INFERENCE_ADDRESS ||
    process.argv[2];
  const requestIdRaw = process.env.AIVM_REQUEST_ID || process.argv[3];

  const addr = requireValue("AIVM inference v2 contract address", contractAddress);
  const requestIdStr = requireValue("AIVM_REQUEST_ID (or argv[3])", requestIdRaw);
  const requestId = BigInt(requestIdStr);

  const c = await ethers.getContractAt("AIVMInferenceV2", addr);
  const r = await c.requests(requestId);

  console.log("📄 AIVMInferenceV2.requests(", requestId.toString(), ")");
  console.log("status=", Number(r.status));
  console.log("requester=", r.requester);
  console.log("model=", r.model);
  console.log("modelDigest=", r.modelDigest);
  console.log("detConfigHash=", r.detConfigHash);
  console.log("promptHash=", r.promptHash);
  console.log("promptId=", r.promptId);
  console.log("taskId=", r.taskId);
  console.log("fee=", r.fee.toString());
  console.log("createdAt=", r.createdAt.toString());
  console.log("commitDeadline=", r.commitDeadline.toString());
  console.log("revealDeadline=", r.revealDeadline.toString());
  console.log("finalizeDeadline=", r.finalizeDeadline.toString());
  console.log("worker=", r.worker);
  console.log("commitment=", r.commitment);
  console.log("committedAt=", r.committedAt.toString());
  console.log("responseHash=", r.responseHash);
  console.log("response=", r.response);
  console.log("revealedAt=", r.revealedAt.toString());
  console.log("finalizedAt=", r.finalizedAt.toString());

  const taskId = r.taskId as string;
  if (taskId && taskId !== ethers.ZeroHash) {
    const count = await c.poiAttestationCount(taskId);
    const poiResult = await c.poiResultHashByTask(taskId);
    const poiTranscript = await c.poiTranscriptHashByTask(taskId);
    const poiSlot = await c.poiSlotByTask(taskId);
    console.log("poiAttestationCount=", Number(count));
    console.log("poiResultHashByTask=", poiResult);
    console.log("poiTranscriptHashByTask=", poiTranscript);
    console.log("poiSlotByTask=", poiSlot.toString());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

