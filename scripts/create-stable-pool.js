const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const bn = require('bignumber.js');
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

// 导入预编译的Uniswap合约artifact
const UniswapV3FactoryArtifact = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
const NonfungiblePositionManagerArtifact = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");
const UniswapV3PoolArtifact = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");

// 配置参数
const TOKEN_A_CONFIG = {
  name: "TokenA",
  symbol: "TKA",
  decimals: 18,
  totalSupply: "1000000" // 100万枚
};

const TOKEN_B_CONFIG = {
  name: "TokenB",
  symbol: "TKB",
  decimals: 18,
  totalSupply: "1000000" // 100万枚
};

// Uniswap V3 池子参数
const POOL_CONFIG = {
  fee: 500, // 0.05%费率，适合稳定币对
  tickSpacing: 10, // 对应0.05%费率的tick间距
  initialPrice: "1" // 初始价格：1 TokenA = 1 TokenB
};

// 已有的合约地址
const EXISTING_CONTRACTS = {
  UniswapV3Factory: "0xCbaec1555707dFAff3303ed6123Db16Eb67F1791",
  NonfungiblePositionManager: "0xc01DdaBBA95E9Cb45C1D7919c0B9f2fb6740c9f4",
  SwapRouter: "0x3DDB759BF377A352aA12e319a93B17ffA512Dd69"
};

// 正确计算 sqrtPriceX96 (兼容 ethers v6)
function encodePriceSqrt(reserve1, reserve0) {
  // 使用 bignumber.js 进行高精度数学计算
  return BigInt(new bn(reserve1.toString())
    .div(reserve0.toString())
    .sqrt()
    .multipliedBy(new bn(2).pow(96))
    .integerValue(3) // 3 表示向下取整
    .toString());
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("使用账户进行部署:", deployer.address);

  // 获取网络信息
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "localhost" : network.name;
  console.log("部署网络:", networkName);

  // 部署信息对象
  const deploymentInfo = {
    network: networkName,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  // 1. 部署两个 ERC20 代币
  console.log("正在部署 TokenA ERC20...");
  const TokenA = await ethers.getContractFactory("guoWenCoin");
  const tokenA = await TokenA.deploy(
    TOKEN_A_CONFIG.name,
    TOKEN_A_CONFIG.symbol,
    TOKEN_A_CONFIG.decimals,
    ethers.parseUnits(TOKEN_A_CONFIG.totalSupply, TOKEN_A_CONFIG.decimals),
    deployer.address
  );
  await tokenA.waitForDeployment();
  const tokenAAddress = await tokenA.getAddress();
  console.log("✅ TokenA 部署到:", tokenAAddress);

  console.log("正在部署 TokenB ERC20...");
  const TokenB = await ethers.getContractFactory("guoWenCoin");
  const tokenB = await TokenB.deploy(
    TOKEN_B_CONFIG.name,
    TOKEN_B_CONFIG.symbol,
    TOKEN_B_CONFIG.decimals,
    ethers.parseUnits(TOKEN_B_CONFIG.totalSupply, TOKEN_B_CONFIG.decimals),
    deployer.address
  );
  await tokenB.waitForDeployment();
  const tokenBAddress = await tokenB.getAddress();
  console.log("✅ TokenB 部署到:", tokenBAddress);

  deploymentInfo.contracts.TokenA = {
    address: tokenAAddress,
    transactionHash: tokenA.deploymentTransaction().hash
  };
  
  deploymentInfo.contracts.TokenB = {
    address: tokenBAddress,
    transactionHash: tokenB.deploymentTransaction().hash
  };

  // 2. 创建 Uniswap V3 池子
  console.log("正在创建流动性池...");
  const factory = new ethers.Contract(
    EXISTING_CONTRACTS.UniswapV3Factory,
    UniswapV3FactoryArtifact.abi,
    deployer
  );

  // 确定代币顺序 (Uniswap 要求 token0 < token1)
  let token0, token1;
  if (tokenAAddress.toLowerCase() < tokenBAddress.toLowerCase()) {
    token0 = tokenAAddress;
    token1 = tokenBAddress;
  } else {
    token0 = tokenBAddress;
    token1 = tokenAAddress;
  }
  console.log(`代币顺序: token0=${token0}, token1=${token1}`);

  // 检查池子是否已存在
  const existingPoolAddress = await factory.getPool(token0, token1, POOL_CONFIG.fee);
  if (existingPoolAddress !== ethers.ZeroAddress) {
    console.log("⚠️  池子已存在:", existingPoolAddress);
    deploymentInfo.contracts.Pool = {
      address: existingPoolAddress,
      token0: token0,
      token1: token1,
      fee: POOL_CONFIG.fee
    };
  } else {
    // 创建新池子
    const tx = await factory.createPool(token0, token1, POOL_CONFIG.fee);
    const receipt = await tx.wait();
    
    // 从事件中获取池子地址
    const poolAddress = await factory.getPool(token0, token1, POOL_CONFIG.fee);
    console.log("✅ 池子创建成功:", poolAddress);

    deploymentInfo.contracts.Pool = {
      address: poolAddress,
      token0: token0,
      token1: token1,
      fee: POOL_CONFIG.fee,
      transactionHash: receipt.hash
    };

    // 3. 初始化池子（设置初始价格）
    console.log("正在初始化池子...");
    const pool = new ethers.Contract(
      poolAddress,
      UniswapV3PoolArtifact.abi,
      deployer
    );

    // 计算初始 sqrtPriceX96
    const sqrtPriceX96 = encodePriceSqrt(POOL_CONFIG.initialPrice, 1);
    console.log("初始 sqrtPriceX96:", sqrtPriceX96.toString());

    // 初始化池子
    const initializeTx = await pool.initialize(sqrtPriceX96);
    await initializeTx.wait();
    console.log("✅ 池子初始化成功");
  }

  // 4. 为池子提供初始流动性
  console.log("正在提供初始流动性...");
  const positionManager = new ethers.Contract(
    EXISTING_CONTRACTS.NonfungiblePositionManager,
    NonfungiblePositionManagerArtifact.abi,
    deployer
  );
  
  // 批准代币使用
  const tokenAInstance = await ethers.getContractAt("guoWenCoin", tokenAAddress);
  const tokenBInstance = await ethers.getContractAt("guoWenCoin", tokenBAddress);

  // 批准PositionManager使用代币
  const maxApproveAmount = ethers.MaxUint256;
  console.log("批准 TokenA...");
  const approveTxA = await tokenAInstance.approve(EXISTING_CONTRACTS.NonfungiblePositionManager, maxApproveAmount);
  await approveTxA.wait();
  console.log("✅ TokenA 批准成功");
  // 检查授权额度
    const allowanceA = await tokenAInstance.allowance(deployer.address, EXISTING_CONTRACTS.NonfungiblePositionManager);
    console.log("TokenA 授权额度:", ethers.formatUnits(allowanceA, 18));
  console.log("批准 TokenB...");
  const approveTxB = await tokenBInstance.approve(EXISTING_CONTRACTS.NonfungiblePositionManager, maxApproveAmount);
  await approveTxB.wait();
  console.log("✅ TokenB 批准成功");
    // 检查授权额度
    const allowanceB = await tokenBInstance.allowance(deployer.address, EXISTING_CONTRACTS.NonfungiblePositionManager);
    console.log("TokenB 授权额度:", ethers.formatUnits(allowanceB, 18));

  // 检查余额
  const tokenABalance = await tokenAInstance.balanceOf(deployer.address);
  const tokenBBalance = await tokenBInstance.balanceOf(deployer.address);
  console.log("TokenA 余额:", ethers.formatUnits(tokenABalance, 18));
  console.log("TokenB 余额:", ethers.formatUnits(tokenBBalance, 18));

  // 确定流动性参数
  // let amount0Desired, amount1Desired;
  
  // 根据代币顺序确定流动性数量
  // if (token0 === tokenAAddress) {
  //   amount0Desired = ethers.parseUnits("1000", 18); // 1000 TokenA
  //   amount1Desired = ethers.parseUnits("1000", 18); // 1000 TokenB (1:1 价格)
  // } else {
  //   amount0Desired = ethers.parseUnits("1000", 18); // 1000 TokenB
  //   amount1Desired = ethers.parseUnits("1000", 18); // 1000 TokenA (1:1 价格)
  // }
  const amount0Desired0 = ethers.parseUnits("1000", 18);
  const amount0Desired1 = ethers.parseUnits("1000", 18);
  // 获取当前池子状态以确定合适的tick范围
  const poolAddress = deploymentInfo.contracts.Pool.address;
  const pool = new ethers.Contract(
    poolAddress,
    UniswapV3PoolArtifact.abi,
    deployer
  );
  
  const slot0 = await pool.slot0();
  const currentTick = Number(slot0.tick); // 转换为 Number 类型
  console.log("当前池子 tick:", currentTick);
  console.log("当前池子 sqrtPriceX96:", slot0.sqrtPriceX96.toString());

  // 设置流动性参数
  const liquidityParams = {
    token0: token0,
    token1: token1,
    fee: POOL_CONFIG.fee,
    tickLower: currentTick - 1000, // 价格范围下限
    tickUpper: currentTick + 1000, // 价格范围上限
    amount0Desired: amount0Desired0,
    amount1Desired: amount0Desired1,
    amount0Min: 0,
    amount1Min: 0,
    recipient: deployer.address,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20 // 20分钟有效期
  };

  console.log("添加流动性参数:", {
    ...liquidityParams
    // amount0Desired: ethers.formatUnits(amount0Desired, 18),
    // amount1Desired: ethers.formatUnits(amount1Desired, 18)
  });

  // 添加流动性
  try {
    const liquidityTx = await positionManager.mint(liquidityParams, { gasLimit: 1000000 });
    const liquidityReceipt = await liquidityTx.wait();
    console.log("✅ 流动性添加成功，交易哈希:", liquidityReceipt.hash);

    deploymentInfo.contracts.Pool.liquidityTransaction = liquidityReceipt.hash;
  } catch (error) {
    console.error("❌ 添加流动性失败:", error);
    // 保存部署信息，即使流动性添加失败
    saveDeploymentInfo(networkName, deploymentInfo);
    throw error;
  }

  // 5. 保存部署信息
  saveDeploymentInfo(networkName, deploymentInfo);

  console.log("🎉 池子创建完成！");
  console.log("部署摘要:");
  console.log("- TokenA 地址:", tokenAAddress);
  console.log("- TokenB 地址:", tokenBAddress);
  console.log("- 流动池地址:", deploymentInfo.contracts.Pool.address);
  console.log("- 流动性交易:", deploymentInfo.contracts.Pool.liquidityTransaction);
}

// 保存部署信息到文件
function saveDeploymentInfo(networkName, deploymentInfo) {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const networkDir = path.join(deploymentsDir, networkName);
  
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  if (!fs.existsSync(networkDir)) {
    fs.mkdirSync(networkDir);
  }
  
  const deploymentFilePath = path.join(networkDir, "pool-deployment.json");
  fs.writeFileSync(deploymentFilePath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(`✅ 部署信息已保存到: ${deploymentFilePath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });