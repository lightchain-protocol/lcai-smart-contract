
const { ethers } = require("ethers");
const key = "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356";
const wallet = new ethers.Wallet(key);
console.log("Address:", wallet.address);
const target = "0x1543AE4f736F9BD2dE677530b758Ccea06cfE245";
console.log("Match:", wallet.address.toLowerCase() === target.toLowerCase());
