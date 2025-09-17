const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");

// 配置参数：要提取代币的流动性头寸ID
const COLLECT_CONFIG = {
  tokenId: 1, // 需要根据实际记录填写
  network: "sepolia" // 默认网络名称，可通过命令行参数覆盖
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("使用账户提取代币:", deployer.address);

  // 解析命令行参数（如果有）
  const args = process.argv.slice(2);
  if (args.length > 0) {
    if (args[0] === "--network") {
      COLLECT_CONFIG.network = args[1] || COLLECT_CONFIG.network;
    } else if (args[0] === "--tokenId") {
      COLLECT_CONFIG.tokenId = parseInt(args[1]) || COLLECT_CONFIG.tokenId;
    }
  }

  // 获取网络信息
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? COLLECT_CONFIG.network : network.name;
  console.log(`在 ${networkName} 网络上执行提取操作`);

  // 加载部署信息
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const networkDir = path.join(deploymentsDir, networkName);
  const deploymentFilePath = path.join(networkDir, "pool-deployment.json");
  
  if (!fs.existsSync(deploymentFilePath)) {
    throw new Error(`找不到部署信息文件: ${deploymentFilePath}`);
  }
  
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFilePath, "utf8"));
  console.log(`加载部署信息成功 (链ID: ${deploymentInfo.chainId})`);
  
  // 获取NonfungiblePositionManager合约地址
  const positionManagerAddress = deploymentInfo.contracts.NonfungiblePositionManager || "0xc01DdaBBA95E9Cb45C1D7919c0B9f2fb6740c9f4";
  
  // 初始化合约
  const NonfungiblePositionManagerArtifact = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");
  const positionManager = new ethers.Contract(
    positionManagerAddress,
    NonfungiblePositionManagerArtifact.abi,
    deployer
  );
  
  console.log(`连接至 NonfungiblePositionManager 合约: ${positionManagerAddress}`);
  
  // 1. 验证NFT所有权
  console.log(`验证流动性头寸 #${COLLECT_CONFIG.tokenId} 的所有权...`);
  try {
    const owner = await positionManager.ownerOf(COLLECT_CONFIG.tokenId);
    if (owner !== deployer.address) {
      throw new Error(`流动性头寸 #${COLLECT_CONFIG.tokenId} 不属于当前账户 ${deployer.address}`);
    }
    console.log("✅ 账户拥有该流动性头寸");
  } catch (error) {
    if (error.message.includes("ERC721: invalid token ID")) {
      throw new Error(`流动性头寸 #${COLLECT_CONFIG.tokenId} 不存在`);
    }
    throw error;
  }
  
  // 2. 获取头寸信息
  console.log("获取头寸信息...");
  const positionInfo = await positionManager.positions(COLLECT_CONFIG.tokenId);
  
  // 解析代币信息
  const token0Address = positionInfo.token0;
  const token1Address = positionInfo.token1;
  
  const token0 = await ethers.getContractAt("guoWenCoin", token0Address);
  const token1 = await ethers.getContractAt("guoWenCoin", token1Address);
  
  const token0Symbol = await token0.symbol();
  const token1Symbol = await token1.symbol();
  
  const token0Decimals = await token0.decimals();
  const token1Decimals = await token1.decimals();
  
  // 获取待提取的代币数量
  const tokensOwed0 = positionInfo.tokensOwed0;
  const tokensOwed1 = positionInfo.tokensOwed1;
  
  console.log("头寸信息:");
  console.log(`- 代币0: ${token0Symbol} (${token0Address})`);
  console.log(`- 代币1: ${token1Symbol} (${token1Address})`);
  console.log(`- 待提取 ${token0Symbol}: ${ethers.formatUnits(tokensOwed0, token0Decimals)}`);
  console.log(`- 待提取 ${token1Symbol}: ${ethers.formatUnits(tokensOwed1, token1Decimals)}`);
  
  // 3. 检查是否有代币可提取
  if (tokensOwed0 === 0n && tokensOwed1 === 0n) {
    console.log("⚠️ 没有可提取的代币，无需执行提取操作");
    return;
  }
  
  // 4. 准备提取参数
  const collectParams = {
    tokenId: COLLECT_CONFIG.tokenId,
    recipient: deployer.address,
    amount0Max: tokensOwed0,
    amount1Max: tokensOwed1
  };
  
  console.log("提取参数:");
  console.log(`- 接收方: ${deployer.address}`);
  console.log(`- 提取 ${token0Symbol} 数量: ${ethers.formatUnits(tokensOwed0, token0Decimals)}`);
  console.log(`- 提取 ${token1Symbol} 数量: ${ethers.formatUnits(tokensOwed1, token1Decimals)}`);
  
  // 5. 获取当前账户余额（提取前）
  const balance0Before = await token0.balanceOf(deployer.address);
  const balance1Before = await token1.balanceOf(deployer.address);
  
  console.log("提取前账户余额:");
  console.log(`- ${token0Symbol}: ${ethers.formatUnits(balance0Before, token0Decimals)}`);
  console.log(`- ${token1Symbol}: ${ethers.formatUnits(balance1Before, token1Decimals)}`);
  
  // 6. 执行提取操作
  try {
    console.log("正在提取代币...");
    const collectTx = await positionManager.collect(collectParams, { 
      gasLimit: 300000 
    });
    
    console.log(`交易已发送，哈希: ${collectTx.hash}`);
    const collectReceipt = await collectTx.wait();
    console.log(`✅ 代币提取成功！区块号: ${collectReceipt.blockNumber}`);
    
    // 7. 验证提取结果
    const balance0After = await token0.balanceOf(deployer.address);
    const balance1After = await token1.balanceOf(deployer.address);
    
    const received0 = balance0After - balance0Before;
    const received1 = balance1After - balance1Before;
    
    console.log("提取后账户余额:");
    console.log(`- ${token0Symbol}: ${ethers.formatUnits(balance0After, token0Decimals)}`);
    console.log(`- ${token1Symbol}: ${ethers.formatUnits(balance1After, token1Decimals)}`);
    
    console.log("实际提取数量:");
    console.log(`- ${token0Symbol}: ${ethers.formatUnits(received0, token0Decimals)}`);
    console.log(`- ${token1Symbol}: ${ethers.formatUnits(received1, token1Decimals)}`);
    
    // 验证提取数量是否正确
    if (received0 !== tokensOwed0) {
      console.warn(`⚠️ ${token0Symbol} 提取数量不匹配: 预期 ${ethers.formatUnits(tokensOwed0, token0Decimals)}, 实际 ${ethers.formatUnits(received0, token0Decimals)}`);
    }
    
    if (received1 !== tokensOwed1) {
      console.warn(`⚠️ ${token1Symbol} 提取数量不匹配: 预期 ${ethers.formatUnits(tokensOwed1, token1Decimals)}, 实际 ${ethers.formatUnits(received1, token1Decimals)}`);
    }
    
    if (received0 === tokensOwed0 && received1 === tokensOwed1) {
      console.log("🎉 代币提取完全成功！");
    }
  } catch (error) {
    console.error("❌ 代币提取失败:", error);
    
    // 尝试解析错误原因
    if (error.data) {
      try {
        const decodedError = positionManager.interface.parseError(error.data);
        console.error("错误详情:", decodedError.name, decodedError.args);
      } catch (e) {
        console.error("无法解析错误数据:", error.data);
      }
    }
    
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 脚本执行出错:", error);
    process.exit(1);
  });