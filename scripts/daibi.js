const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 配置参数
const TOKEN_A_CONFIG = {
  name: "HE",
  symbol: "HE",
  decimals: 18,
  totalSupply: "1000000" // 100万枚
};

const TOKEN_B_CONFIG = {
  name: "SHE",
  symbol: "SHE",
  decimals: 18,
  totalSupply: "1000000" // 100万枚
};

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

  // 5. 保存部署信息
  saveDeploymentInfo(networkName, deploymentInfo);

  console.log("部署摘要:");
  console.log("- TokenA 地址:", tokenAAddress);
  console.log("- TokenB 地址:", tokenBAddress);
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
  
  const deploymentFilePath = path.join(networkDir, "daibi2-deployment.json");
  fs.writeFileSync(deploymentFilePath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(`✅ 部署信息已保存到: ${deploymentFilePath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });