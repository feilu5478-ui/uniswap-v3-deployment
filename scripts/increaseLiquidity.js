const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");
const readline = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout
});

// Uniswap V3 合约ABI
const UniswapV3PoolArtifact = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");

// 配置参数：新添加的流动性数量
const ADD_LIQUIDITY_CONFIG = {
  amount0Desired: ethers.parseUnits("1000", 18), // 1000 TokenA
  amount1Desired: ethers.parseUnits("1000", 18)  // 1000 TokenB
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("使用账户添加流动性:", deployer.address);

  // 读取部署信息
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "localhost" : network.name;
  const deploymentInfoPath = path.join(__dirname, "..", "deployments", networkName, "pool-deployment.json");
  
  if (!fs.existsSync(deploymentInfoPath)) {
    throw new Error(`找不到部署信息文件: ${deploymentInfoPath}`);
  }
  
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, "utf8"));
  console.log(`加载部署信息成功 (链ID: ${deploymentInfo.chainId})`);

  // 获取合约地址
  const tokenAAddress = deploymentInfo.contracts.TokenA.address;
  const tokenBAddress = deploymentInfo.contracts.TokenB.address;
  const poolAddress = deploymentInfo.contracts.Pool.address;
  const positionManagerAddress = deploymentInfo.contracts.NonfungiblePositionManager || "0xc01DdaBBA95E9Cb45C1D7919c0B9f2fb6740c9f4";

  console.log("池子地址:", poolAddress);
  console.log("TokenA 地址:", tokenAAddress);
  console.log("TokenB 地址:", tokenBAddress);
  console.log("Position Manager 地址:", positionManagerAddress);

  // 获取合约实例
  const NonfungiblePositionManagerArtifact = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");
  const positionManager = new ethers.Contract(
    positionManagerAddress,
    NonfungiblePositionManagerArtifact.abi,
    deployer
  );

  const tokenA = await ethers.getContractAt("guoWenCoin", tokenAAddress);
  const tokenB = await ethers.getContractAt("guoWenCoin", tokenBAddress);

  // 获取用户所有流动性头寸
  console.log("\n获取用户流动性头寸...");
  const balance = await positionManager.balanceOf(deployer.address);
  console.log(`找到 ${balance} 个流动性头寸`);
  
  if (balance === 0) {
    throw new Error("用户没有流动性头寸");
  }

  // 收集所有头寸信息
  const positions = [];
  for (let i = 0; i < balance; i++) {
    const tokenId = await positionManager.tokenOfOwnerByIndex(deployer.address, i);
    const positionInfo = await positionManager.positions(tokenId);
    
    // 获取待领取手续费
    const tokensOwed0 = ethers.formatUnits(positionInfo.tokensOwed0, 18);
    const tokensOwed1 = ethers.formatUnits(positionInfo.tokensOwed1, 18);
    
    positions.push({
      tokenId: tokenId.toString(),
      liquidity: positionInfo.liquidity.toString(),
      token0: positionInfo.token0,
      token1: positionInfo.token1,
      fee: positionInfo.fee,
      tickLower: positionInfo.tickLower,
      tickUpper: positionInfo.tickUpper,
      tokensOwed0,
      tokensOwed1
    });
    
    console.log(`头寸 #${i + 1}: ID=${tokenId}, 流动性=${positionInfo.liquidity.toString()}, 待收手续费: ${tokensOwed0} TKA + ${tokensOwed1} TKB`);
  }

  // 让用户选择要操作的头寸
  const selectedTokenId = await new Promise((resolve) => {
    readline.question("\n请输入要增加流动性的头寸ID: ", (input) => {
      resolve(input);
    });
  });

  // 验证输入的头寸ID
  const selectedPosition = positions.find(p => p.tokenId === selectedTokenId);
  if (!selectedPosition) {
    throw new Error("无效的头寸ID");
  }

  console.log(`\n已选择头寸 #${selectedTokenId}:`);
  console.log(`- 价格区间: [${selectedPosition.tickLower}, ${selectedPosition.tickUpper}]`);
  console.log(`- 当前流动性: ${selectedPosition.liquidity}`);
  console.log(`- 待收手续费: ${selectedPosition.tokensOwed0} TKA + ${selectedPosition.tokensOwed1} TKB`);

  // 批准代币给Position Manager
  console.log("\n批准TokenA...");
  const approveTxA = await tokenA.approve(positionManagerAddress, ADD_LIQUIDITY_CONFIG.amount0Desired);
  await approveTxA.wait();
  console.log("批准TokenB...");
  const approveTxB = await tokenB.approve(positionManagerAddress, ADD_LIQUIDITY_CONFIG.amount1Desired);
  await approveTxB.wait();

  // 构建增加流动性参数
  const params = {
    tokenId: selectedTokenId,
    amount0Desired: ADD_LIQUIDITY_CONFIG.amount0Desired,
    amount1Desired: ADD_LIQUIDITY_CONFIG.amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20 // 20分钟截止
  };

  // 执行增加流动性操作
  console.log("\n增加流动性并更新手续费...");
  const tx = await positionManager.increaseLiquidity(params, { gasLimit: 1500000 });
  const receipt = await tx.wait();
  console.log(`交易成功! 哈希: ${receipt.hash}`);

  // 解析事件获取结果
  const increaseLiquidityEvent = receipt.logs
    .map(log => {
      try {
        return positionManager.interface.parseLog(log);
      } catch (e) {
        return null;
      }
    })
    .find(event => event && event.name === "IncreaseLiquidity");
  
  const collectEvent = receipt.logs
    .map(log => {
      try {
        return positionManager.interface.parseLog(log);
      } catch (e) {
        return null;
      }
    })
    .find(event => event && event.name === "Collect");

  if (increaseLiquidityEvent) {
    const liquidityAdded = increaseLiquidityEvent.args.liquidity.toString();
    const amount0Added = ethers.formatUnits(increaseLiquidityEvent.args.amount0, 18);
    const amount1Added = ethers.formatUnits(increaseLiquidityEvent.args.amount1, 18);
    
    console.log("\n流动性增加结果:");
    console.log(`- 新增流动性: ${liquidityAdded}`);
    console.log(`- 添加的 TokenA 数量: ${amount0Added}`);
    console.log(`- 添加的 TokenB 数量: ${amount1Added}`);
  }

  if (collectEvent) {
    const amount0Collected = ethers.formatUnits(collectEvent.args.amount0, 18);
    const amount1Collected = ethers.formatUnits(collectEvent.args.amount1, 18);
    
    console.log("\n手续费更新结果:");
    console.log(`- 领取的 TokenA 手续费: ${amount0Collected}`);
    console.log(`- 领取的 TokenB 手续费: ${amount1Collected}`);
  }

  // 获取更新后的头寸状态
  console.log("\n获取更新后的头寸状态...");
  const updatedPosition = await positionManager.positions(selectedTokenId);
  const updatedLiquidity = updatedPosition.liquidity.toString();
  const updatedTokensOwed0 = ethers.formatUnits(updatedPosition.tokensOwed0, 18);
  const updatedTokensOwed1 = ethers.formatUnits(updatedPosition.tokensOwed1, 18);
  
  console.log("更新后的头寸状态:");
  console.log(`- 总流动性: ${updatedLiquidity}`);
  console.log(`- 待收手续费: ${updatedTokensOwed0} TKA + ${updatedTokensOwed1} TKB`);
}

main()
  .then(() => {
    console.log("\n✅ 操作完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ 操作失败:", error);
    process.exit(1);
  })
  .finally(() => {
    readline.close();
  });