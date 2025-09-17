const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 转账配置
const TRANSFER_CONFIG = {
  recipient: "0x0b511e0C4890881352e00f3E48f5B6C0D08B8A9B", // 接收方地址
  amount: 10000, // 转账数量（单位：个）
  decimals: 18, // 代币精度（与部署时一致）
  network: "sepolia" // 默认网络名称，可通过命令行参数覆盖
};

async function main() {
  // 获取网络信息
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? TRANSFER_CONFIG.network : network.name;
  
  // 解析命令行参数（如果有）
  const args = process.argv.slice(2);
  if (args.length > 0) {
    if (args[0] === "--network") {
      networkName = args[1] || networkName;
    } else if (args[0] === "--recipient") {
      TRANSFER_CONFIG.recipient = args[1] || TRANSFER_CONFIG.recipient;
    } else if (args[0] === "--amount") {
      TRANSFER_CONFIG.amount = parseInt(args[1]) || TRANSFER_CONFIG.amount;
    }
  }
  
  console.log(`在 ${networkName} 网络上执行转账操作`);
  console.log(`接收方地址: ${TRANSFER_CONFIG.recipient}`);
  console.log(`转账数量: ${TRANSFER_CONFIG.amount} 个代币`);

  // 加载部署信息
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const networkDir = path.join(deploymentsDir, networkName);
  const deploymentFilePath = path.join(networkDir, "pool-deployment.json");
  
  if (!fs.existsSync(deploymentFilePath)) {
    throw new Error(`找不到部署信息文件: ${deploymentFilePath}`);
  }
  
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFilePath, "utf8"));
  console.log(`加载部署信息成功 (链ID: ${deploymentInfo.chainId})`);
  
  // 获取代币地址
  const tokenAAddress = deploymentInfo.contracts.TokenA.address;
  const tokenBAddress = deploymentInfo.contracts.TokenB.address;
  
  if (!tokenAAddress || !tokenBAddress) {
    throw new Error("部署信息中缺少代币地址");
  }
  
  console.log(`TokenA 地址: ${tokenAAddress}`);
  console.log(`TokenB 地址: ${tokenBAddress}`);
  
  // 获取部署者账户
  const [deployer] = await ethers.getSigners();
  console.log(`使用账户进行转账: ${deployer.address}`);
  
  // 检查账户余额
  const ethBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`账户 ETH 余额: ${ethers.formatEther(ethBalance)} ETH`);
  
  // 转账函数
  const transferTokens = async (tokenAddress, tokenName) => {
    console.log(`\n开始转账 ${tokenName}...`);
    
    // 创建代币合约实例
    const token = await ethers.getContractAt("guoWenCoin", tokenAddress, deployer);
    
    // 获取代币信息
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    console.log(`${tokenName} 符号: ${symbol}, 精度: ${decimals}`);
    
    // 计算转账数量（考虑精度）
    const amountToTransfer = ethers.parseUnits(TRANSFER_CONFIG.amount.toString(), decimals);
    console.log(`转账数量: ${ethers.formatUnits(amountToTransfer, decimals)} ${symbol}`);
    
    // 检查发送方余额
    const senderBalance = await token.balanceOf(deployer.address);
    console.log(`发送方余额: ${ethers.formatUnits(senderBalance, decimals)} ${symbol}`);
    
    if (senderBalance < amountToTransfer) {
      throw new Error(`余额不足，无法转账 ${ethers.formatUnits(amountToTransfer, decimals)} ${symbol}`);
    }
    
    // 检查接收方当前余额
    const recipientBalanceBefore = await token.balanceOf(TRANSFER_CONFIG.recipient);
    console.log(`接收方当前余额: ${ethers.formatUnits(recipientBalanceBefore, decimals)} ${symbol}`);
    
    // 执行转账
    console.log(`正在转账...`);
    const tx = await token.transfer(TRANSFER_CONFIG.recipient, amountToTransfer);
    console.log(`交易已发送，哈希: ${tx.hash}`);
    
    // 等待交易确认
    const receipt = await tx.wait();
    console.log(`交易已确认，区块号: ${receipt.blockNumber}`);
    
    // 验证转账结果
    const recipientBalanceAfter = await token.balanceOf(TRANSFER_CONFIG.recipient);
    const expectedBalance = recipientBalanceBefore + amountToTransfer;
    
    if (recipientBalanceAfter === expectedBalance) {
      console.log(`✅ 转账成功！接收方新余额: ${ethers.formatUnits(recipientBalanceAfter, decimals)} ${symbol}`);
    } else {
      console.log(`❌ 转账验证失败！预期余额: ${ethers.formatUnits(expectedBalance, decimals)}，实际余额: ${ethers.formatUnits(recipientBalanceAfter, decimals)}`);
    }
    
    return receipt;
  };
  
  // 执行 TokenA 转账
  console.log("\n===== 开始 TokenA 转账 =====");
  await transferTokens(tokenAAddress, "TokenA");
  
  // 执行 TokenB 转账
  console.log("\n===== 开始 TokenB 转账 =====");
  await transferTokens(tokenBAddress, "TokenB");
  
  console.log("\n🎉 所有代币转账操作完成！");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 脚本执行出错:", error);
    process.exit(1);
  });