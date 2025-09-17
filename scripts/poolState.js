// const { ethers } = require("hardhat");
// const path = require("path");
// const fs = require("fs");

// async function main() {
//   const [deployer] = await ethers.getSigners();
//   console.log("查询池子状态...");

//   // 读取部署信息
//   const network = await ethers.provider.getNetwork();
//   const networkName = network.name === "unknown" ? "localhost" : network.name;
//   const deploymentInfoPath = path.join(__dirname, "..", "deployments", networkName, "pool-deployment.json");
//   const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, "utf8"));

//   const poolAddress = deploymentInfo.contracts.Pool.address;

//   // 获取池子合约实例
//   const UniswapV3PoolArtifact = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
//   const pool = new ethers.Contract(poolAddress, UniswapV3PoolArtifact.abi, deployer);

//   // 查询池子状态
//   const slot0 = await pool.slot0();
//   const liquidity = await pool.liquidity();
//   const feeGrowthGlobal0X128 = await pool.feeGrowthGlobal0X128();
//   const feeGrowthGlobal1X128 = await pool.feeGrowthGlobal1X128();
//   const token0 = await pool.token0();
//   const token1 = await pool.token1();
//   const fee = await pool.fee();

//   console.log("池子状态:");
//   console.log(`- token0: ${token0}`);
//   console.log(`- token1: ${token1}`);
//   console.log(`- fee: ${fee}`);
//   console.log(`- sqrtPriceX96: ${slot0.sqrtPriceX96}`);
//   console.log(`- tick: ${slot0.tick}`);
//   console.log(`- liquidity: ${liquidity}`);
//   console.log(`- feeGrowthGlobal0X128: ${feeGrowthGlobal0X128}`);
//   console.log(`- feeGrowthGlobal1X128: ${feeGrowthGlobal1X128}`);
//   console.log(`- 代币对：${token0}/${token1}`);

//   console.log("=== 池子状态 ===");
//   console.log(`代币对: ${token0} / ${token1}`);
//   // console.log(`费率: ${fee} (${fee / 10000}%)`);
//   console.log(`当前价格 sqrtPriceX96: ${slot0.sqrtPriceX96}`);
//   console.log(`当前 tick: ${slot0.tick}`);
//   console.log(`当前流动性: ${liquidity}`);
//   console.log(`全局手续费增长 Token0: ${feeGrowthGlobal0}`);
//   console.log(`全局手续费增长 Token1: ${feeGrowthGlobal1}`);
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

  // 查询关键状态
  const [slot0, liquidity, feeGrowthGlobal0, feeGrowthGlobal1, token0, token1, fee] = await Promise.all([
    pool.slot0(),
    pool.liquidity(),
    pool.feeGrowthGlobal0X128(),
    pool.feeGrowthGlobal1X128(),
    pool.token0(),
    pool.token1(),
    pool.fee()
  ]);

  console.log("=== 池子状态 ===");
  console.log(`代币对: ${token0} / ${token1}`);
  // console.log(`费率: ${fee} (${fee / 10000}%)`);
  console.log(`当前价格 sqrtPriceX96: ${slot0.sqrtPriceX96}`);
  console.log(`当前 tick: ${slot0.tick}`);
  console.log(`当前流动性: ${liquidity}`);
  console.log(`全局手续费增长 Token0: ${feeGrowthGlobal0}`);
  console.log(`全局手续费增长 Token1: ${feeGrowthGlobal1}`);
}

main().catch(console.error);