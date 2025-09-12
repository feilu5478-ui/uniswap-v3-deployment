// // deployV3WETH9.js
// const hre = require("hardhat");

// async function main() {
//   // 使用 ethers.getContractFactory 来获取合约工厂。
//   // "WETH9" 必须与你的合约文件中的合约名称严格一致。
//   const WETH9 = await hre.ethers.getContractFactory("WETH9");

//   // 部署合约，无构造函数参数
//   const weth9 = await WETH9.deploy();
  
//   // 等待合约正式部署上链
//   await weth9.waitForDeployment();

//   // 获取部署后的合约地址
//   const weth9Address = await weth9.getAddress();
//   console.log("WETH9 deployed to:", weth9Address);

//   // 返回合约地址，便于其他脚本使用
//   return weth9Address;
// }

// // 推荐使用这种异步函数调用模式
// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
const { ethers } = require("hardhat");

async function main() {
  console.log("正在获取部署者账户...");
  const [deployer] = await ethers.getSigners();
  console.log("使用账户部署 WETH9:", deployer.address);

  // 不再从 @uniswap/v3-periphery 导入，而是使用 Hardhat 直接编译和部署本地合约
  console.log("正在获取 WETH9 合约工厂...");
  
  // 方法一：如果你的 WETH9 合约已经在 contracts 目录下，可以直接使用 getContractFactory
  const WETH9 = await ethers.getContractFactory("WETH9"); // 确保合约名称与文件名一致
  
  // 方法二：如果你不想将合约文件放在 contracts 目录，或者想直接使用你提供的源码字符串（需要稍复杂的设置）
  // 但通常方法一是最直接的方式

  console.log("正在部署 WETH9...");
  const weth9 = await WETH9.deploy(); // WETH9 构造函数无参数
  await weth9.waitForDeployment();

  const weth9Address = await weth9.getAddress();
  console.log("✅ WETH9 成功部署到地址:", weth9Address);

  // 可选：验证合约功能
  const name = await weth9.name();
  const symbol = await weth9.symbol();
  console.log(`✅ WETH9 基本信息 - 名称: ${name}, 符号: ${symbol}`);

  return weth9Address; // 返回地址供后续脚本使用
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ WETH9 部署失败:", error);
    process.exit(1);
  });