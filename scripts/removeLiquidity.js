const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");

// 配置参数：要移除的流动性头寸ID和流动性数量
const REMOVE_LIQUIDITY_CONFIG = {
  tokenId: 1, // 需要根据实际记录填写
  liquidityPercentage: 0.5 // 移除50%的流动性
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("使用账户移除流动性:", deployer.address);

  // 读取部署信息
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "localhost" : network.name;
  const deploymentInfoPath = path.join(__dirname, "..", "deployments", networkName, "pool-deployment.json");
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, "utf8"));

  // 获取NonfungiblePositionManager合约实例
  const NonfungiblePositionManagerArtifact = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");
  const positionManager = new ethers.Contract(
    deploymentInfo.contracts.NonfungiblePositionManager || "0xc01DdaBBA95E9Cb45C1D7919c0B9f2fb6740c9f4",
    NonfungiblePositionManagerArtifact.abi,
    deployer
  );

  // 获取流动性头寸信息
  const positionInfo = await positionManager.positions(REMOVE_LIQUIDITY_CONFIG.tokenId);
  const liquidity = positionInfo.liquidity;

  // 计算要移除的流动性数量
  const liquidityToRemove = liquidity * BigInt(Math.floor(REMOVE_LIQUIDITY_CONFIG.liquidityPercentage * 100)) / 100n;
  // const liquidityToRemove = REMOVE_LIQUIDITY_CONFIG.liquidityPercentage;

  console.log(`头寸总流动性: ${liquidity}`);
  console.log(`要移除的流动性: ${liquidityToRemove}`);

  // 调用decreaseLiquidity
  const decreaseLiquidityParams = {
    tokenId: REMOVE_LIQUIDITY_CONFIG.tokenId,
    liquidity: liquidityToRemove,
    amount0Min: 0,
    amount1Min: 0,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10
  };

  console.log("移除流动性...");
  const removeTx = await positionManager.decreaseLiquidity(decreaseLiquidityParams, { gasLimit: 1000000 });
  const removeReceipt = await removeTx.wait();
  console.log(`流动性移除成功！交易哈希: ${removeReceipt.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });