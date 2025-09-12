const { expect } = require('chai');
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

describe('UniswapV3 Full Functionality Test', function () {
  // 增加超时时间，因为区块链交易可能需要更长时间
  this.timeout(60000);

  // 合约实例变量
  let uniswapV3Factory;
  let swapRouter;
  let nftPositionManager;
  let weth9;
  let testToken;
  
  // 账户变量
  let deployer;
  let user1;
  let user2;
  
  // 部署信息
  let deploymentInfo;
  
  // 池子信息
  let poolAddress;
  const feeAmount = 3000; // 0.3% 池子费用等级

  before(async function () {
    // 获取账户
    [deployer, user1, user2] = await ethers.getSigners();
    
    // 加载部署信息
    const networkName = (await ethers.provider.getNetwork()).name;
    const deploymentPath = path.join(__dirname, '..', 'deployments', networkName, 'deployment.json');
    
    try {
      deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      console.log('✅ 成功加载部署信息');
    } catch (error) {
      console.error('❌ 无法加载部署信息:', error);
      throw error;
    }

    // 初始化合约实例
    uniswapV3Factory = await ethers.getContractAt(
      'UniswapV3Factory',
      deploymentInfo.contracts.UniswapV3Factory.address
    );

    swapRouter = await ethers.getContractAt(
      'SwapRouter',
      deploymentInfo.contracts.SwapRouter.address
    );

    nftPositionManager = await ethers.getContractAt(
      'NonfungiblePositionManager',
      deploymentInfo.contracts.NonfungiblePositionManager.address
    );

    weth9 = await ethers.getContractAt(
      'WETH9',
      deploymentInfo.contracts.WETH9.address
    );

    // 部署测试代币
    const TestToken = await ethers.getContractFactory('guoWenCoin');
    testToken = await TestToken.deploy(
      'TestToken',
      'TST',
      18,
      ethers.parseEther('1000000'), // 100万代币
      deployer.address
    );
    await testToken.waitForDeployment();
    
    console.log('✅ 所有合约初始化完成');
  });

  describe('1. 基础合约测试', function () {
    it('应该正确加载所有合约地址', async function () {
      expect(deploymentInfo.contracts.UniswapV3Factory.address).to.be.a('string');
      expect(deploymentInfo.contracts.SwapRouter.address).to.be.a('string');
      expect(deploymentInfo.contracts.NonfungiblePositionManager.address).to.be.a('string');
      expect(deploymentInfo.contracts.WETH9.address).to.be.a('string');
    });

    it('应该正确设置合约所有者', async function () {
      expect(await testToken.owner()).to.equal(deployer.address);
    });

    it('应该正确铸造初始代币供应', async function () {
      const deployerBalance = await testToken.balanceOf(deployer.address);
      expect(deployerBalance).to.equal(ethers.parseEther('1000000'));
    });
  });

  describe('2. Uniswap V3 池子创建测试', function () {
    it('应该能创建新的交易对池子', async function () {
      const tx = await uniswapV3Factory.createPool(
        await testToken.getAddress(),
        await weth9.getAddress(),
        feeAmount
      );
      
      await expect(tx)
        .to.emit(uniswapV3Factory, 'PoolCreated')
        .withArgs(
          await testToken.getAddress(),
          await weth9.getAddress(),
          feeAmount,
          await ethers.getAddress() // 池子地址
        );
      
      // 获取池子地址
      poolAddress = await uniswapV3Factory.getPool(
        await testToken.getAddress(),
        await weth9.getAddress(),
        feeAmount
      );
      
      expect(poolAddress).to.not.equal(ethers.ZeroAddress);
      console.log(`✅ 池子创建成功: ${poolAddress}`);
    });

    it('应该能初始化池子流动性', async function () {
      const pool = await ethers.getContractAt('UniswapV3Pool', poolAddress);
      
      // 检查池子是否已初始化
      const slot0 = await pool.slot0();
      expect(slot0.sqrtPriceX96).to.be.gt(0);
      
      console.log(`✅ 池子已初始化，当前价格: ${slot0.sqrtPriceX96}`);
    });
  });

  describe('3. 代币兑换测试', function () {
    it('应该批准Router使用代币', async function () {
      const amount = ethers.parseEther('100');
      
      // 批准Router使用测试代币
      const approveTx = await testToken.connect(deployer).approve(
        deploymentInfo.contracts.SwapRouter.address,
        amount
      );
      
      await expect(approveTx)
        .to.emit(testToken, 'Approval')
        .withArgs(deployer.address, deploymentInfo.contracts.SwapRouter.address, amount);
    });

    it('应该能进行代币兑换', async function () {
      // 将测试代币转换为WETH
      const amountIn = ethers.parseEther('10');
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20分钟后到期
      
      const params = {
        tokenIn: await testToken.getAddress(),
        tokenOut: await weth9.getAddress(),
        fee: feeAmount,
        recipient: deployer.address,
        deadline: deadline,
        amountIn: amountIn,
        amountOutMinimum: 0, // 接受任何输出数量
        sqrtPriceLimitX96: 0,
      };
      
      const swapTx = await swapRouter.exactInputSingle(params);
      await expect(swapTx).to.emit(swapRouter, 'Swap');
      
      // 检查WETH余额是否增加
      const wethBalance = await weth9.balanceOf(deployer.address);
      expect(wethBalance).to.be.gt(0);
      
      console.log(`✅ 兑换成功，获得WETH: ${ethers.formatEther(wethBalance)}`);
    });
  });

  describe('4. 流动性提供测试', function () {
    it('应该能批准NFT管理器使用代币', async function () {
      const amount = ethers.parseEther('1000');
      
      // 批准NFT管理器使用测试代币
      const approveTokenTx = await testToken.connect(deployer).approve(
        deploymentInfo.contracts.NonfungiblePositionManager.address,
        amount
      );
      
      // 批准NFT管理器使用WETH
      const approveWethTx = await weth9.connect(deployer).approve(
        deploymentInfo.contracts.NonfungiblePositionManager.address,
        amount
      );
      
      await expect(approveTokenTx)
        .to.emit(testToken, 'Approval')
        .withArgs(deployer.address, deploymentInfo.contracts.NonfungiblePositionManager.address, amount);
      
      await expect(approveWethTx)
        .to.emit(weth9, 'Approval')
        .withArgs(deployer.address, deploymentInfo.contracts.NonfungiblePositionManager.address, amount);
    });

    it('应该能添加流动性', async function () {
      const amount0Desired = ethers.parseEther('100'); // 测试代币数量
      const amount1Desired = ethers.parseEther('1'); // WETH数量
      
      const params = {
        token0: await testToken.getAddress(),
        token1: await weth9.getAddress(),
        fee: feeAmount,
        tickLower: -1000,
        tickUpper: 1000,
        amount0Desired: amount0Desired,
        amount1Desired: amount1Desired,
        amount0Min: 0,
        amount1Min: 0,
        recipient: deployer.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      };
      
      const mintTx = await nftPositionManager.mint(params);
      const receipt = await mintTx.wait();
      
      // 检查是否创建了NFT
      const nftTransferEvent = receipt.logs.find(
        log => log.fragment && log.fragment.name === 'Transfer'
      );
      
      expect(nftTransferEvent).to.not.be.undefined;
      console.log('✅ 流动性添加成功，创建了NFT位置');
    });
  });

  describe('5. 自定义代币功能测试', function () {
    it('应该能转移代币', async function () {
      const transferAmount = ethers.parseEther('100');
      const initialBalance = await testToken.balanceOf(user1.address);
      
      const transferTx = await testToken.connect(deployer).transfer(
        user1.address,
        transferAmount
      );
      
      await expect(transferTx)
        .to.emit(testToken, 'Transfer')
        .withArgs(deployer.address, user1.address, transferAmount);
      
      const finalBalance = await testToken.balanceOf(user1.address);
      expect(finalBalance - initialBalance).to.equal(transferAmount);
    });

    it('应该能授权和转移来自其他账户的代币', async function () {
      const approveAmount = ethers.parseEther('50');
      const transferAmount = ethers.parseEther('30');
      
      // 用户1批准部署者使用其代币
      const approveTx = await testToken.connect(user1).approve(
        deployer.address,
        approveAmount
      );
      
      await expect(approveTx)
        .to.emit(testToken, 'Approval')
        .withArgs(user1.address, deployer.address, approveAmount);
      
      // 部署者从用户1转移代币到用户2
      const transferFromTx = await testToken.connect(deployer).transferFrom(
        user1.address,
        user2.address,
        transferAmount
      );
      
      await expect(transferFromTx)
        .to.emit(testToken, 'Transfer')
        .withArgs(user1.address, user2.address, transferAmount);
      
      // 检查余额
      const user2Balance = await testToken.balanceOf(user2.address);
      expect(user2Balance).to.equal(transferAmount);
    });

    it('应该能调用openTrading函数', async function () {
      // 这个测试需要根据你的openTrading函数的具体逻辑进行调整
      const outputRoots = [user1.address, user2.address];
      const l2BlockNumber = 1000;
      const newLimit = 100;
      
      const openTradingTx = await testToken.connect(deployer).openTrading(
        outputRoots,
        l2BlockNumber,
        newLimit
      );
      
      // 根据你的函数实现添加适当的断言
      await expect(openTradingTx).to.not.be.reverted;
      console.log('✅ openTrading函数调用成功');
    });
  });

  describe('6. 高级功能测试', function () {
    it('应该能查询池子信息', async function () {
      const pool = await ethers.getContractAt('UniswapV3Pool', poolAddress);
      
      const liquidity = await pool.liquidity();
      const slot0 = await pool.slot0();
      
      expect(liquidity).to.be.gt(0);
      expect(slot0.sqrtPriceX96).to.be.gt(0);
      
      console.log(`✅ 池子流动性: ${liquidity}`);
      console.log(`✅ 当前价格: ${slot0.sqrtPriceX96}`);
    });

    it('应该能查询NFT位置信息', async function () {
      // 获取部署者的NFT数量
      const balance = await nftPositionManager.balanceOf(deployer.address);
      expect(balance).to.be.gt(0);
      
      if (balance > 0) {
        // 获取第一个NFT的tokenId
        const tokenId = await nftPositionManager.tokenOfOwnerByIndex(deployer.address, 0);
        
        // 获取位置信息
        const position = await nftPositionManager.positions(tokenId);
        
        expect(position.liquidity).to.be.gt(0);
        console.log(`✅ NFT位置流动性: ${position.liquidity}`);
      }
    });
  });

  after(async function () {
    console.log('\n📊 部署合约地址:');
    console.log(`   UniswapV3Factory: ${deploymentInfo.contracts.UniswapV3Factory.address}`);
    console.log(`   SwapRouter: ${deploymentInfo.contracts.SwapRouter.address}`);
    console.log(`   NonfungiblePositionManager: ${deploymentInfo.contracts.NonfungiblePositionManager.address}`);
    console.log(`   WETH9: ${deploymentInfo.contracts.WETH9.address}`);
    console.log(`   测试代币: ${await testToken.getAddress()}`);
    console.log(`   交易对池子: ${poolAddress}`);
    
    console.log('\n✅ 所有测试完成！Uniswap V3 系统功能正常。');
  });
});