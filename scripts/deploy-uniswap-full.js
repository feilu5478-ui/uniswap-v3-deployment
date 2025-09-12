const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 导入 artifact
const UniswapV3FactoryArtifact = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
const SwapRouterArtifact = require("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");
const NFTDescriptorArtifact = require("@uniswap/v3-periphery/artifacts/contracts/libraries/NFTDescriptor.sol/NFTDescriptor.json");
const NonfungibleTokenPositionDescriptorArtifact = require("@uniswap/v3-periphery/artifacts/contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json");
const NonfungiblePositionManagerArtifact = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");

// WETH artifact
const WETHArtifact = require("../artifacts/contracts/WETH9.sol/WETH9.json");

function linkLibraries(artifact, libraries) {
  let bytecode = artifact.bytecode;
  const linkReferences = artifact.linkReferences;

  if (!linkReferences) {
    throw new Error("No link references found in artifact");
  }

  Object.keys(linkReferences).forEach((fileName) => {
    Object.keys(linkReferences[fileName]).forEach((contractName) => {
      if (!libraries.hasOwnProperty(contractName)) {
        throw new Error(`Missing link library name ${contractName}`);
      }
      const address = ethers.getAddress(libraries[contractName]).toLowerCase().slice(2);
      linkReferences[fileName][contractName].forEach(({ start, length }) => {
        const start2 = 2 + start * 2;
        const length2 = length * 2;
        bytecode = bytecode.slice(0, start2) + address + bytecode.slice(start2 + length2);
      });
    });
  });

  return bytecode;
}

// 将 BigInt 转换为字符串的辅助函数
function bigIntReplacer(key, value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

// 保存部署信息到文件
function saveDeploymentInfo(networkName, deploymentInfo) {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const networkDir = path.join(deploymentsDir, networkName);
  
  // 确保目录存在
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  if (!fs.existsSync(networkDir)) {
    fs.mkdirSync(networkDir);
  }
  
  // 保存部署信息，使用自定义 replacer 处理 BigInt
  const deploymentFilePath = path.join(networkDir, "deployment.json");
  fs.writeFileSync(deploymentFilePath, JSON.stringify(deploymentInfo, bigIntReplacer, 2));
  
  // 保存ABI文件
  const abiDir = path.join(networkDir, "abi");
  if (!fs.existsSync(abiDir)) {
    fs.mkdirSync(abiDir);
  }
  
  // 保存每个合约的ABI
  Object.keys(deploymentInfo.contracts).forEach(contractName => {
    const abiFilePath = path.join(abiDir, `${contractName}.json`);
    fs.writeFileSync(abiFilePath, JSON.stringify(deploymentInfo.contracts[contractName].abi, null, 2));
  });
  
  console.log(`✅ 部署信息已保存到: ${deploymentFilePath}`);
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
    chainId: Number(network.chainId), // 转换为数字以避免 BigInt 问题
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  // 部署 WETH
  // console.log("正在部署 WETH...");
  // const WETHFactory = new ethers.ContractFactory(WETHArtifact.abi, WETHArtifact.bytecode, deployer);
  // const weth = await WETHFactory.deploy();
  // await weth.waitForDeployment();
  const wethAddress = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"; // 预先部署的 WETH 地址
  console.log("✅ WETH 部署到:", wethAddress);
  
  // // 保存 WETH 信息
  deploymentInfo.contracts.WETH9 = {
    address: wethAddress,
    abi: WETHArtifact.abi
    // transactionHash: weth.deploymentTransaction().hash
  };

  // 部署 Factory
  console.log("正在部署 UniswapV3Factory...");
  const Factory = new ethers.ContractFactory(UniswapV3FactoryArtifact.abi, UniswapV3FactoryArtifact.bytecode, deployer);
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✅ UniswapV3Factory 部署到:", factoryAddress);
  
  // 保存 Factory 信息
  deploymentInfo.contracts.UniswapV3Factory = {
    address: factoryAddress,
    abi: UniswapV3FactoryArtifact.abi,
    transactionHash: factory.deploymentTransaction().hash
  };

  // 部署 NFTDescriptor
  console.log("正在部署 NFTDescriptor...");
  const NFTDescriptor = new ethers.ContractFactory(NFTDescriptorArtifact.abi, NFTDescriptorArtifact.bytecode, deployer);
  const nftDescriptor = await NFTDescriptor.deploy();
  await nftDescriptor.waitForDeployment();
  const nftDescriptorAddress = await nftDescriptor.getAddress();
  console.log("✅ NFTDescriptor 部署到:", nftDescriptorAddress);
  
  // 保存 NFTDescriptor 信息
  deploymentInfo.contracts.NFTDescriptor = {
    address: nftDescriptorAddress,
    abi: NFTDescriptorArtifact.abi,
    transactionHash: nftDescriptor.deploymentTransaction().hash
  };

  // 部署 NonfungibleTokenPositionDescriptor
  console.log("正在部署 NonfungibleTokenPositionDescriptor...");
  const linkedBytecode = linkLibraries(
    NonfungibleTokenPositionDescriptorArtifact,
    { NFTDescriptor: nftDescriptorAddress }
  );
  const NonfungibleTokenPositionDescriptor = new ethers.ContractFactory(
    NonfungibleTokenPositionDescriptorArtifact.abi,
    linkedBytecode,
    deployer
  );
  const nonfungibleTokenPositionDescriptor = await NonfungibleTokenPositionDescriptor.deploy(
    wethAddress,
    ethers.encodeBytes32String('WETH'),
    {}  // 添加空的 overrides 对象
  );
  await nonfungibleTokenPositionDescriptor.waitForDeployment();
  const nonfungibleTokenPositionDescriptorAddress = await nonfungibleTokenPositionDescriptor.getAddress();
  console.log("✅ NonfungibleTokenPositionDescriptor 部署到:", nonfungibleTokenPositionDescriptorAddress);
  
  // 保存 NonfungibleTokenPositionDescriptor 信息
  deploymentInfo.contracts.NonfungibleTokenPositionDescriptor = {
    address: nonfungibleTokenPositionDescriptorAddress,
    abi: NonfungibleTokenPositionDescriptorArtifact.abi,
    transactionHash: nonfungibleTokenPositionDescriptor.deploymentTransaction().hash
  };

  // 部署 NonfungiblePositionManager
  console.log("正在部署 NonfungiblePositionManager...");
  const NonfungiblePositionManager = new ethers.ContractFactory(
    NonfungiblePositionManagerArtifact.abi,
    NonfungiblePositionManagerArtifact.bytecode,
    deployer
  );
  const nonfungiblePositionManager = await NonfungiblePositionManager.deploy(
    factoryAddress,
    wethAddress,
    nonfungibleTokenPositionDescriptorAddress
  );
  await nonfungiblePositionManager.waitForDeployment();
  const nonfungiblePositionManagerAddress = await nonfungiblePositionManager.getAddress();
  console.log("✅ NonfungiblePositionManager 部署到:", nonfungiblePositionManagerAddress);
  
  // 保存 NonfungiblePositionManager 信息
  deploymentInfo.contracts.NonfungiblePositionManager = {
    address: nonfungiblePositionManagerAddress,
    abi: NonfungiblePositionManagerArtifact.abi,
    transactionHash: nonfungiblePositionManager.deploymentTransaction().hash
  };

  // 部署 SwapRouter
  console.log("正在部署 SwapRouter...");
  const SwapRouter = new ethers.ContractFactory(SwapRouterArtifact.abi, SwapRouterArtifact.bytecode, deployer);
  const swapRouter = await SwapRouter.deploy(factoryAddress, wethAddress);
  await swapRouter.waitForDeployment();
  const swapRouterAddress = await swapRouter.getAddress();
  console.log("✅ SwapRouter 部署到:", swapRouterAddress);
  
  // 保存 SwapRouter 信息
  deploymentInfo.contracts.SwapRouter = {
    address: swapRouterAddress,
    abi: SwapRouterArtifact.abi,
    transactionHash: swapRouter.deploymentTransaction().hash
  };

  // 保存部署信息到文件
  saveDeploymentInfo(networkName, deploymentInfo);
  
  console.log("🎉 所有合约部署完成！");
  console.log("部署摘要:");
  console.log("- WETH9:", wethAddress);
  console.log("- UniswapV3Factory:", factoryAddress);
  console.log("- NFTDescriptor:", nftDescriptorAddress);
  console.log("- NonfungibleTokenPositionDescriptor:", nonfungibleTokenPositionDescriptorAddress);
  console.log("- NonfungiblePositionManager:", nonfungiblePositionManagerAddress);
  console.log("- SwapRouter:", swapRouterAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });