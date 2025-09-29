const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");

// 配置参数
const SWAP_CONFIG = {
  amountIn: "1000", // 输入代币数量（例如100个TokenA）
  slippage: 0.5, // 滑点容忍度（百分比）
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("使用账户进行交换:", deployer.address);

  // 读取部署信息
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "localhost" : network.name;
  const deploymentInfoPath = path.join(__dirname, "..", "deployments", networkName, "pool2-deployment.json");
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, "utf8"));

  const tokenAAddress = deploymentInfo.contracts.TokenA.address;
  const tokenBAddress = deploymentInfo.contracts.TokenB.address;
  const poolAddress = deploymentInfo.contracts.Pool.address;
  const poolFee = deploymentInfo.contracts.Pool.fee;

  // 获取SwapRouter合约实例
  const SwapRouterArtifact = require("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");
  const swapRouter = new ethers.Contract(
    deploymentInfo.contracts.SwapRouter || "0x3DDB759BF377A352aA12e319a93B17ffA512Dd69", // 使用用户提供的地址或默认值
    SwapRouterArtifact.abi,
    deployer
  );

  // 获取代币实例
  const tokenA = await ethers.getContractAt("guoWenCoin", tokenAAddress);
  const tokenB = await ethers.getContractAt("guoWenCoin", tokenBAddress);

  // 批准SwapRouter使用TokenA
  const amountIn = ethers.parseUnits(SWAP_CONFIG.amountIn, 18);
  const allowance = await tokenA.allowance(deployer.address, swapRouter.target);
  // const allowance = await tokenB.allowance(deployer.address, swapRouter.target);
  if (allowance < amountIn) {
    console.log("批准TokenA给SwapRouter...");
    // console.log("批准TokenB给SwapRouter...");
    const approveTx = await tokenA.approve(swapRouter.target, ethers.MaxUint256);
    // const approveTx = await tokenB.approve(swapRouter.target, ethers.MaxUint256);
    await approveTx.wait();
    console.log("批准成功");
  }

  // 获取报价（使用Quoter合约）
  const QuoterArtifact = require("@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json");
  const quoterAddress = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"; // Uniswap V3 Quoter主网地址
  const quoter = new ethers.Contract(quoterAddress, QuoterArtifact.abi, deployer);

//   const quotedAmountOut = await quoter.quoteExactInputSingle.staticCall(
//     tokenAAddress,
//     tokenBAddress,
//     poolFee,
//     amountIn,
//     0
//   );

  console.log(`输入金额: ${ethers.formatUnits(amountIn, 18)} TokenA`);
  // console.log(`输入金额: ${ethers.formatUnits(amountIn, 18)} TokenB`);
//   console.log(`预期输出: ${ethers.formatUnits(quotedAmountOut, 18)} TokenB`);

  // 计算最小输出（考虑滑点）
//   const amountOutMinimum = quotedAmountOut * (100 - SWAP_CONFIG.slippage) / 100;
//   console.log(`最小输出: ${ethers.formatUnits(amountOutMinimum, 18)} TokenB`);

  // 执行交换
  const params = {
    tokenIn: tokenAAddress,
    tokenOut: tokenBAddress,
    // tokenIn: tokenBAddress,
    // tokenOut: tokenAAddress,
    fee: poolFee,
    recipient: deployer.address,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10, // 10分钟截止
    amountIn: amountIn,
    amountOutMinimum: 0, // 为简单起见，这里不考虑滑点
    sqrtPriceLimitX96: 0
  };

  console.log("执行交换...");
  const swapTx = await swapRouter.exactInputSingle(params, { gasLimit: 1000000 });
  const receipt = await swapTx.wait();
  console.log(`交换成功！交易哈希: ${receipt.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });