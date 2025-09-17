// const { ethers } = require("hardhat");
// const path = require("path");
// const fs = require("fs");

// async function main() {
//   const [deployer] = await ethers.getSigners();
//   console.log("查询交易历史...");

//   // 读取部署信息
//   const network = await ethers.provider.getNetwork();
//   const networkName = network.name === "unknown" ? "localhost" : network.name;
//   const deploymentInfoPath = path.join(__dirname, "..", "deployments", networkName, "pool-deployment.json");
//   const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, "utf8"));

//   const poolAddress = deploymentInfo.contracts.Pool.address;

//   // 获取池子合约实例
//   const UniswapV3PoolArtifact = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
//   const pool = new ethers.Contract(poolAddress, UniswapV3PoolArtifact.abi, deployer);

//   // 查询Swap事件
//   const swapFilter = pool.filters.Swap();
//   const swapEvents = await pool.queryFilter(swapFilter, -9); // 查询最近1000个区块的Swap事件

//   console.log(`找到 ${swapEvents.length} 笔交换交易`);
//   swapEvents.forEach((event, index) => {
//     console.log(`交易${index + 1}:`);
//     console.log(`- 交易哈希: ${event.transactionHash}`);
//     console.log(`- 发送者: ${event.args.sender}`);
//     console.log(`- 接收者: ${event.args.recipient}`);
//     console.log(`- amount0: ${ethers.formatUnits(event.args.amount0, 18)}`);
//     console.log(`- amount1: ${ethers.formatUnits(event.args.amount1, 18)}`);
//     console.log(`- sqrtPriceX96: ${event.args.sqrtPriceX96}`);
//     console.log(`- liquidity: ${event.args.liquidity}`);
//     console.log(`- tick: ${event.args.tick}`);
//   });
// }

// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();

  // 加载部署信息
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "localhost" : network.name;
  const deploymentInfoPath = path.join(__dirname, "..", "deployments", networkName, "pool-deployment.json");
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, "utf8"));
  const poolAddress = deploymentInfo.contracts.Pool.address;

  // 初始化池子合约
  const UniswapV3PoolArtifact = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
  const pool = new ethers.Contract(poolAddress, UniswapV3PoolArtifact.abi, deployer);

  // 查询最近 1000 个区块内的 Swap 事件
  const swapFilter = pool.filters.Swap();
  const swaps = await pool.queryFilter(swapFilter, -9);

  console.log(`发现 ${swaps.length} 笔交换交易:`);
  swaps.forEach((event, index) => {
    console.log(`${index + 1}. 交易哈希: ${event.transactionHash}`);
    console.log(`   sender: ${event.args.sender}`);
    console.log(`   recipient: ${event.args.recipient}`);
    console.log(`   amount0: ${ethers.formatUnits(event.args.amount0, 18)}`);
    console.log(`   amount1: ${ethers.formatUnits(event.args.amount1, 18)}`);
    console.log(`   sqrtPriceX96: ${event.args.sqrtPriceX96}`);
    console.log(`   liquidity: ${event.args.liquidity}`);
    console.log(`   tick: ${event.args.tick}\n`);
  });

  // 查询 Mint 事件（流动性添加）
  const mintFilter = pool.filters.Mint();
  const mints = await pool.queryFilter(mintFilter, -9);
  console.log(`发现 ${mints.length} 笔流动性添加交易`);
  
  // 查询 Burn 事件（流动性移除）
  const burnFilter = pool.filters.Burn();
  const burns = await pool.queryFilter(burnFilter, -9);
  console.log(`发现 ${burns.length} 笔流动性移除交易`);
}

main().catch(console.error);