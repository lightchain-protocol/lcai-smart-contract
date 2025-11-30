
const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const address = "0xaBe5eAF18CFe388BeDC2fe6B6E71c43eB55b286e";
    const code = await provider.getCode(address);

    console.log(`Checking code at ${address}...`);
    if (code === "0x") {
        console.log("❌ No code found at this address.");
    } else {
        console.log(`✅ Contract deployed! Code size: ${(code.length - 2) / 2} bytes`);
    }
}

main().catch(console.error);
