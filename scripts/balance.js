const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("使用账户查询池子余额:", deployer.address);

  // 获取网络信息
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "localhost" : network.name;
  console.log("查询网络:", networkName);

  // 加载部署信息
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const networkDir = path.join(deploymentsDir, networkName);
  const deploymentFilePath = path.join(networkDir, "pool-deployment.json");
  
  if (!fs.existsSync(deploymentFilePath)) {
    throw new Error(`找不到部署信息文件: ${deploymentFilePath}`);
  }
  
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFilePath, "utf8"));
  console.log(`加载部署信息成功 (链ID: ${deploymentInfo.chainId})`);
  
  // 获取池子地址和代币地址
  const poolAddress = deploymentInfo.contracts.Pool.address;
  const tokenAAddress = deploymentInfo.contracts.TokenA.address;
  const tokenBAddress = deploymentInfo.contracts.TokenB.address;
  
  console.log("池子地址:", poolAddress);
  console.log("TokenA 地址:", tokenAAddress);
  console.log("TokenB 地址:", tokenBAddress);
  
  // 创建代币合约实例
  const tokenA = await ethers.getContractAt("guoWenCoin", tokenAAddress);
  const tokenB = await ethers.getContractAt("guoWenCoin", tokenBAddress);
  
  // 获取代币信息
  const tokenASymbol = await tokenA.symbol();
  const tokenBSymbol = await tokenB.symbol();
  const tokenADecimals = await tokenA.decimals();
  const tokenBDecimals = await tokenB.decimals();
  
  console.log(`代币信息: ${tokenASymbol} (${tokenADecimals} 位小数), ${tokenBSymbol} (${tokenBDecimals} 位小数)`);
  
  // 查询池子在两种代币中的余额
  console.log("查询池子代币余额...");
  
  const tokenABalanceRaw = await tokenA.balanceOf(poolAddress);
  const tokenBBalanceRaw = await tokenB.balanceOf(poolAddress);
  
  // 转换为可读格式
  const tokenABalance = ethers.formatUnits(tokenABalanceRaw, tokenADecimals);
  const tokenBBalance = ethers.formatUnits(tokenBBalanceRaw, tokenBDecimals);
  
  console.log("\n池子代币余额:");
  console.log(`- ${tokenASymbol}: ${tokenABalance}`);
  console.log(`- ${tokenBSymbol}: ${tokenBBalance}`);
  
  // 获取池子合约实例
  const UniswapV3PoolArtifact = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
  const pool = new ethers.Contract(
    poolAddress,
    UniswapV3PoolArtifact.abi,
    deployer
  );
  
  // 查询池子状态
  console.log("\n查询池子状态...");
  
  try {
    const slot0 = await pool.slot0();
    const liquidity = await pool.liquidity();
    const fee = await pool.fee();
    
    console.log("当前价格 sqrtPriceX96:", slot0.sqrtPriceX96.toString());
    console.log("当前 tick:", slot0.tick.toString());
    console.log("池子流动性:", liquidity.toString());
    console.log("费率:", fee);
    
    // 计算实际价格
    sq = Number(slot0.sqrtPriceX96);
    const price0 = (sq ** 2) / (2 ** 192);
    const price1 = 1 / price0;
    
    console.log(`\n价格信息:`);
    console.log(`- 1 ${tokenASymbol} = ${price0} ${tokenBSymbol}`);
    console.log(`- 1 ${tokenBSymbol} = ${price1} ${tokenASymbol}`);
  } catch (error) {
    console.error("查询池子状态失败:", error);
  }
  
  console.log("\n✅ 查询完成");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 查询失败:", error);
    process.exit(1);
  });