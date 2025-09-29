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
  name: "天",
  symbol: "TT",
  decimals: 18,
  totalSupply: "1000000" // 100万枚
};

const TOKEN_B_CONFIG = {
  name: "地",
  symbol: "DD",
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

// 正确计算 sqrtPriceX96 (修复版本)
function encodePriceSqrt(token1Amount, token0Amount) {
  // 确保使用正确的顺序：token1/token0
  const price = new bn(token1Amount.toString()).div(token0Amount.toString());
  const sqrtPrice = price.sqrt();
  const sqrtPriceX96 = sqrtPrice.multipliedBy(new bn(2).pow(96));
  
  return BigInt(sqrtPriceX96.integerValue(bn.ROUND_DOWN).toString());
}

// 计算 tick 从价格
function priceToTick(price) {
  const tick = Math.floor(Math.log(price) / Math.log(1.0001));
  return tick;
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
  let token0, token1, isTokenA0;
  if (tokenAAddress.toLowerCase() < tokenBAddress.toLowerCase()) {
    token0 = tokenAAddress;
    token1 = tokenBAddress;
    isTokenA0 = true;
    console.log("代币顺序: token0=TokenA(TT), token1=TokenB(DD)");
  } else {
    token0 = tokenBAddress;
    token1 = tokenAAddress;
    isTokenA0 = false;
    console.log("代币顺序: token0=TokenB(DD), token1=TokenA(TT)");
  }

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
    console.log("创建新池子...");
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

    // 计算初始 sqrtPriceX96 - 根据代币顺序调整价格计算
    let sqrtPriceX96;
    if (isTokenA0) {
      // token0 = TT, token1 = DD, 价格 1 TT = 1 DD
      sqrtPriceX96 = encodePriceSqrt(1, 1); // token1/token0 = 1/1 = 1
    } else {
      // token0 = DD, token1 = TT, 价格 1 DD = 1 TT 意味着 1 DD = 1 TT
      sqrtPriceX96 = encodePriceSqrt(1, 1); // token1/token0 = 1/1 = 1
    }
    
    console.log("初始 sqrtPriceX96:", sqrtPriceX96.toString());

    // 初始化池子
    const initializeTx = await pool.initialize(sqrtPriceX96);
    await initializeTx.wait();
    console.log("✅ 池子初始化成功");

    // 验证初始化结果
    const slot0 = await pool.slot0();
    console.log("初始化后的 sqrtPriceX96:", slot0.sqrtPriceX96.toString());
    console.log("初始化后的 tick:", slot0.tick.toString());
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
  
  console.log("批准 TokenB...");
  const approveTxB = await tokenBInstance.approve(EXISTING_CONTRACTS.NonfungiblePositionManager, maxApproveAmount);
  await approveTxB.wait();
  console.log("✅ TokenB 批准成功");

  // 检查授权额度
  const allowanceA = await tokenAInstance.allowance(deployer.address, EXISTING_CONTRACTS.NonfungiblePositionManager);
  const allowanceB = await tokenBInstance.allowance(deployer.address, EXISTING_CONTRACTS.NonfungiblePositionManager);
  console.log("TokenA 授权额度:", ethers.formatUnits(allowanceA, 18));
  console.log("TokenB 授权额度:", ethers.formatUnits(allowanceB, 18));

  // 检查余额
  const tokenABalance = await tokenAInstance.balanceOf(deployer.address);
  const tokenBBalance = await tokenBInstance.balanceOf(deployer.address);
  console.log("TokenA 余额:", ethers.formatUnits(tokenABalance, 18));
  console.log("TokenB 余额:", ethers.formatUnits(tokenBBalance, 18));

  // 获取当前池子状态
  const poolAddress = deploymentInfo.contracts.Pool.address;
  const pool = new ethers.Contract(
    poolAddress,
    UniswapV3PoolArtifact.abi,
    deployer
  );
  
  const slot0 = await pool.slot0();
  const currentTick = Number(slot0.tick);
  console.log("当前池子 tick:", currentTick);
  console.log("当前池子 sqrtPriceX96:", slot0.sqrtPriceX96.toString());

  // 根据代币顺序确定流动性数量
  let amount0Desired, amount1Desired;
  const liquidityAmount = "1000"; // 每种代币提供1000个
  
  if (isTokenA0) {
    // token0 = TT, token1 = DD
    amount0Desired = ethers.parseUnits(liquidityAmount, 18); // 1000 TT
    amount1Desired = ethers.parseUnits(liquidityAmount, 18); // 1000 DD
  } else {
    // token0 = DD, token1 = TT  
    amount0Desired = ethers.parseUnits(liquidityAmount, 18); // 1000 DD
    amount1Desired = ethers.parseUnits(liquidityAmount, 18); // 1000 TT
  }

  // 计算合适的tick范围（围绕当前价格）
  const tickLower = Math.floor(currentTick / POOL_CONFIG.tickSpacing) * POOL_CONFIG.tickSpacing - POOL_CONFIG.tickSpacing * 10;
  const tickUpper = Math.floor(currentTick / POOL_CONFIG.tickSpacing) * POOL_CONFIG.tickSpacing + POOL_CONFIG.tickSpacing * 10;

  console.log("流动性范围:");
  console.log("- Tick Lower:", tickLower);
  console.log("- Tick Upper:", tickUpper);
  console.log("- Tick 间距:", POOL_CONFIG.tickSpacing);

  // 设置流动性参数
  const liquidityParams = {
    token0: token0,
    token1: token1,
    fee: POOL_CONFIG.fee,
    tickLower: tickLower,
    tickUpper: tickUpper,
    amount0Desired: amount0Desired,
    amount1Desired: amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
    recipient: deployer.address,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20 // 20分钟有效期
  };

  console.log("添加流动性参数:");
  console.log("- Token0:", liquidityParams.token0);
  console.log("- Token1:", liquidityParams.token1);
  console.log("- Amount0:", ethers.formatUnits(amount0Desired, 18));
  console.log("- Amount1:", ethers.formatUnits(amount1Desired, 18));
  console.log("- Fee:", liquidityParams.fee);

  // 添加初始流动性
  try {
    console.log("发送添加流动性交易...");
    const liquidityTx = await positionManager.mint(
      liquidityParams,
      { gasLimit: 5000000 } // 增加gas限制
    );
    
    console.log("交易已发送，等待确认...");
    const liquidityReceipt = await liquidityTx.wait();
    console.log("✅ 流动性添加成功，交易哈希:", liquidityReceipt.hash);

    // 解析事件日志查看结果
    const mintEvent = liquidityReceipt.logs.find(log => 
      log.topics[0] === ethers.id("Mint(address,address,uint256,uint256,uint256)")
    );
    
    if (mintEvent) {
      console.log("✅ Mint事件触发成功");
    }

    deploymentInfo.contracts.Pool.liquidityTransaction = liquidityReceipt.hash;
  } catch (error) {
    console.error("❌ 添加流动性失败:", error);
    
    // 尝试获取更详细的错误信息
    if (error.reason) {
      console.error("错误原因:", error.reason);
    }
    if (error.data) {
      console.error("错误数据:", error.data);
    }
    
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
  console.log("- 代币顺序:", isTokenA0 ? "TokenA(TT) -> TokenB(DD)" : "TokenB(DD) -> TokenA(TT)");
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
  
  const deploymentFilePath = path.join(networkDir, "pool3-deployment.json");
  fs.writeFileSync(deploymentFilePath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(`✅ 部署信息已保存到: ${deploymentFilePath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });