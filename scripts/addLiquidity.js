const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");

const UniswapV3PoolArtifact = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");

// 配置参数：新的价格区间
const NEW_POSITION_CONFIG = {
  amount0Desired: ethers.parseUnits("10000", 18), // 500 TokenA
  amount1Desired: ethers.parseUnits("10000", 18)  // 500 TokenB
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("使用账户添加流动性:", deployer.address);

  // 读取部署信息
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "localhost" : network.name;
  const deploymentInfoPath = path.join(__dirname, "..", "deployments", networkName, "pool2-deployment.json");
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, "utf8"));

  const tokenAAddress = deploymentInfo.contracts.TokenA.address;
  const tokenBAddress = deploymentInfo.contracts.TokenB.address;
  const poolFee = deploymentInfo.contracts.Pool.fee;

  // 获取NonfungiblePositionManager合约实例
  const NonfungiblePositionManagerArtifact = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");
  const positionManager = new ethers.Contract(
    deploymentInfo.contracts.NonfungiblePositionManager || "0xc01DdaBBA95E9Cb45C1D7919c0B9f2fb6740c9f4",
    NonfungiblePositionManagerArtifact.abi,
    deployer
  );

  // 获取代币实例
  const tokenA = await ethers.getContractAt("guoWenCoin", tokenAAddress);
  const tokenB = await ethers.getContractAt("guoWenCoin", tokenBAddress);

  // 批准代币
  console.log("批准TokenA...");
  const approveTxA = await tokenA.approve(positionManager.target, ethers.MaxUint256);
  await approveTxA.wait();
  console.log("批准TokenB...");
  const approveTxB = await tokenB.approve(positionManager.target, ethers.MaxUint256);
  await approveTxB.wait();

  // 确定代币顺序（与创建池子时一致）
  let token0, token1;
  if (tokenAAddress.toLowerCase() < tokenBAddress.toLowerCase()) {
    token0 = tokenAAddress;
    token1 = tokenBAddress;
  } else {
    token0 = tokenBAddress;
    token1 = tokenAAddress;
  }

  const poolAddress = deploymentInfo.contracts.Pool.address;
  const pool = new ethers.Contract(
    poolAddress,
    UniswapV3PoolArtifact.abi,
    deployer
  );
  
  const slot0 = await pool.slot0();
  const currentTick = Number(slot0.tick); // 转换为 Number 类型
  console.log("当前池子 tick:", currentTick);
  console.log("价格范围:", currentTick - 1000, "到", currentTick + 1000);

  // 添加流动性参数
  const liquidityParams = {
    token0: token0,
    token1: token1,
    fee: poolFee,
    tickLower: -10010, // 价格范围下限
    tickUpper: 10010, // 价格范围上限
    amount0Desired: NEW_POSITION_CONFIG.amount0Desired,
    amount1Desired: NEW_POSITION_CONFIG.amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
    recipient: deployer.address,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20 // 20分钟截止
  };

  console.log("添加流动性...");
  const liquidityTx = await positionManager.mint(liquidityParams, { gasLimit: 1000000 });
  const receipt = await liquidityTx.wait();
  console.log(`流动性添加成功！交易哈希: ${receipt.hash}`);

  // 解析事件获取tokenId（流动性头寸ID）
  const events = receipt.logs.map(log => {
    try {
      return positionManager.interface.parseLog(log);
    } catch (e) {
      return null;
    }
  }).filter(event => event !== null);

  const increaseLiquidityEvent = events.find(event => event.name === "IncreaseLiquidity");
  const mintEvent = events.find(event => event.name === "Mint");

  if (mintEvent) {
    const tokenId = mintEvent.args.tokenId;
    console.log(`新流动性头寸ID: ${tokenId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });