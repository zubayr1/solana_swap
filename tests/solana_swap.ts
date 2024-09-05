import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaSwap } from "../target/types/solana_swap";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// Configure the client to use the local cluster.
anchor.setProvider(anchor.AnchorProvider.env());

describe("solana_swap_init", () => {
  // Instantiate the program client
  const program = anchor.workspace.SolanaSwap as Program<SolanaSwap>;

  // Generate a keypair for the pool account
  const pool = anchor.web3.Keypair.generate();

  it("Is initialized!", async () => {
    // Create an instance of the Anchor Provider
    const provider = program.provider as anchor.AnchorProvider;

    // Call the initializePool function
    const tx = await program.methods
      .initializePool()
      .accounts({
        pool: pool.publicKey,
        payer: provider.wallet.publicKey,
      })
      .signers([pool]) // Sign transaction with the pool keypair
      .rpc(); // Send the transaction

    console.log("Transaction signature:", tx);

    // Fetch the pool account data to verify initialization
    const poolAccount = await program.account.pool.fetch(pool.publicKey);
    console.log("Pool account data:", poolAccount);

    // Add assertions to verify the pool was initialized correctly
    expect(poolAccount.authority.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
  });
});

describe("solana_swap_deposit", () => {
  const payer = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const freezeAuthority = Keypair.generate();

  const program = anchor.workspace.SolanaSwap as Program<SolanaSwap>;
  const provider = program.provider as anchor.AnchorProvider;

  // Create a keypair for the pool account
  const pool = anchor.web3.Keypair.generate();
  let userTokenAccountA: PublicKey;
  let userTokenAccountB: PublicKey;
  let poolTokenAccountA: PublicKey;
  let poolTokenAccountB: PublicKey;
  let tokenMintA: PublicKey;
  let tokenMintB: PublicKey;

  const connection = new Connection("http://localhost:8899", "confirmed");

  before(async () => {
    // Airdrop SOL to the payer account
    const airdropSignature = await connection.requestAirdrop(
      payer.publicKey,
      LAMPORTS_PER_SOL
    );
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    // Create the mints
    tokenMintA = await createMint(
      connection,
      payer,
      mintAuthority.publicKey,
      freezeAuthority.publicKey,
      9
    );

    tokenMintB = await createMint(
      connection,
      payer,
      mintAuthority.publicKey,
      freezeAuthority.publicKey,
      9
    );

    // Create associated token accounts for the user and the pool
    userTokenAccountA = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintA,
        payer.publicKey
      )
    ).address;

    userTokenAccountB = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintB,
        payer.publicKey
      )
    ).address;

    poolTokenAccountA = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintA,
        pool.publicKey
      )
    ).address;

    poolTokenAccountB = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintB,
        pool.publicKey
      )
    ).address;

    // Mint tokens to the user accounts
    await mintTo(
      connection,
      payer,
      tokenMintA,
      userTokenAccountA,
      mintAuthority.publicKey,
      1000,
      [mintAuthority]
    );

    await mintTo(
      connection,
      payer,
      tokenMintB,
      userTokenAccountB,
      mintAuthority.publicKey,
      1000,
      [mintAuthority]
    );
  });

  it("Deposit tokens into the pool", async () => {
    // Initialize the pool
    await program.methods
      .initializePool()
      .accounts({
        pool: pool.publicKey,
        payer: provider.wallet.publicKey,
      })
      .signers([pool])
      .rpc();

    // Deposit amounts
    const depositAmountA = 100;
    const depositAmountB = 200;

    // Call the deposit function
    const tx = await program.methods
      .deposit(new anchor.BN(depositAmountA), new anchor.BN(depositAmountB))
      .accounts({
        pool: pool.publicKey,
        userTokenA: userTokenAccountA,
        userTokenB: userTokenAccountB,
        poolTokenA: poolTokenAccountA,
        poolTokenB: poolTokenAccountB,
        user: payer.publicKey,
      })
      .signers([payer])
      .rpc();

    console.log("Deposit transaction signature:", tx);

    // Fetch the pool account data to verify the deposit
    const poolAccount = await program.account.pool.fetch(pool.publicKey);
    console.log("Pool account data after deposit:", poolAccount);

    // Fetch user token account data to verify token transfers
    const userTokenAccountDataA = await connection.getTokenAccountBalance(
      userTokenAccountA
    );
    const userTokenAccountDataB = await connection.getTokenAccountBalance(
      userTokenAccountB
    );
    const poolTokenAccountDataA = await connection.getTokenAccountBalance(
      poolTokenAccountA
    );
    const poolTokenAccountDataB = await connection.getTokenAccountBalance(
      poolTokenAccountB
    );

    // Add assertions
    expect(poolAccount.tokenAAmount.toNumber()).to.equal(depositAmountA);
    expect(poolAccount.tokenBAmount.toNumber()).to.equal(depositAmountB);

    // Check token account balances
    expect(Number(userTokenAccountDataA.value.amount)).to.equal(
      1000 - depositAmountA
    );
    expect(Number(userTokenAccountDataB.value.amount)).to.equal(
      1000 - depositAmountB
    );
    expect(Number(poolTokenAccountDataA.value.amount)).to.equal(depositAmountA);
    expect(Number(poolTokenAccountDataB.value.amount)).to.equal(depositAmountB);
  });
});

describe("solana_swap_liquidity_operations", () => {
  const payer = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const freezeAuthority = Keypair.generate();
  const program = anchor.workspace.SolanaSwap as Program<SolanaSwap>;
  const provider = program.provider as anchor.AnchorProvider;
  const connection = new Connection("http://localhost:8899", "confirmed");

  let pool: Keypair;
  let userTokenAccountA: PublicKey;
  let userTokenAccountB: PublicKey;
  let poolTokenAccountA: PublicKey;
  let poolTokenAccountB: PublicKey;
  let tokenMintA: PublicKey;
  let tokenMintB: PublicKey;

  before(async () => {
    // Setup code (mint creation, token account creation, etc.)

    // Create and fund pool
    pool = Keypair.generate();

    const airdropSignature = await connection.requestAirdrop(
      payer.publicKey,
      LAMPORTS_PER_SOL
    );

    const latestBlockHash = await connection.getLatestBlockhash();

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    tokenMintA = await createMint(
      connection,
      payer,
      mintAuthority.publicKey,
      freezeAuthority.publicKey,
      9
    );
    tokenMintB = await createMint(
      connection,
      payer,
      mintAuthority.publicKey,
      freezeAuthority.publicKey,
      9
    );

    userTokenAccountA = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintA,
        payer.publicKey
      )
    ).address;
    userTokenAccountB = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintB,
        payer.publicKey
      )
    ).address;
    poolTokenAccountA = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintA,
        pool.publicKey
      )
    ).address;
    poolTokenAccountB = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintB,
        pool.publicKey
      )
    ).address;

    await mintTo(
      connection,
      payer,
      tokenMintA,
      userTokenAccountA,
      mintAuthority.publicKey,
      1000,
      [mintAuthority]
    );
    await mintTo(
      connection,
      payer,
      tokenMintB,
      userTokenAccountB,
      mintAuthority.publicKey,
      1000,
      [mintAuthority]
    );

    // Initialize the pool
    await program.methods
      .initializePool()
      .accounts({
        pool: pool.publicKey,
        payer: provider.wallet.publicKey,
      })
      .signers([pool])
      .rpc();
  });

  it("Add & Remove liquidity from the pool", async () => {
    const initialDepositA = 500;
    const initialDepositB = 300;

    // First, deposit some liquidity to have initial values
    const txinit = await program.methods
      .addLiquidity(
        new anchor.BN(initialDepositA),
        new anchor.BN(initialDepositB)
      )
      .accounts({
        pool: pool.publicKey,
        userTokenA: userTokenAccountA,
        userTokenB: userTokenAccountB,
        poolTokenA: poolTokenAccountA,
        poolTokenB: poolTokenAccountB,
        user: payer.publicKey,
        // tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    const latestBlockHash = await connection.getLatestBlockhash();

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txinit,
    });

    const poolTokenAccountDataAinit = await connection.getTokenAccountBalance(
      poolTokenAccountA
    );
    const poolTokenAccountDataBinit = await connection.getTokenAccountBalance(
      poolTokenAccountB
    );
    const userTokenAccountDataAinit = await connection.getTokenAccountBalance(
      userTokenAccountA
    );
    const userTokenAccountDataBinit = await connection.getTokenAccountBalance(
      userTokenAccountB
    );

    console.log("INIT User Token Account A Data:", userTokenAccountDataAinit);
    console.log("INIT User Token Account B Data:", userTokenAccountDataBinit);
    console.log("INIT Pool Token Account A Data:", poolTokenAccountDataAinit);
    console.log("INIT Pool Token Account B Data:", poolTokenAccountDataBinit);

    const removeAmountA = 100;
    const removeAmountB = 150;

    const tx = await program.methods
      .removeLiquidity(
        new anchor.BN(removeAmountA),
        new anchor.BN(removeAmountB)
      )
      .accounts({
        pool: pool.publicKey,
        userTokenA: userTokenAccountA,
        userTokenB: userTokenAccountB,
        poolTokenA: poolTokenAccountA,
        poolTokenB: poolTokenAccountB,
        user: pool.publicKey,
        // tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([pool])
      .rpc();

    const latestBlockHashnew = await connection.getLatestBlockhash();

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHashnew.lastValidBlockHeight,
      signature: tx,
    });

    // Fetch and log token account data
    const poolAccount = await program.account.pool.fetch(pool.publicKey);
    const userTokenAccountDataA = await connection.getTokenAccountBalance(
      userTokenAccountA
    );
    const userTokenAccountDataB = await connection.getTokenAccountBalance(
      userTokenAccountB
    );
    const poolTokenAccountDataA = await connection.getTokenAccountBalance(
      poolTokenAccountA
    );
    const poolTokenAccountDataB = await connection.getTokenAccountBalance(
      poolTokenAccountB
    );

    console.log("Transaction Signature:", tx);
    console.log("Pool Account Data:", poolAccount);
    console.log("User Token Account A Data:", userTokenAccountDataA);
    console.log("User Token Account B Data:", userTokenAccountDataB);
    console.log("Pool Token Account A Data:", poolTokenAccountDataA);
    console.log("Pool Token Account B Data:", poolTokenAccountDataB);

    // Add assertions
    expect(poolAccount.tokenAAmount.toNumber()).to.equal(initialDepositA);
    expect(poolAccount.tokenBAmount.toNumber()).to.equal(initialDepositB);

    expect(Number(userTokenAccountDataA.value.amount)).to.equal(
      1000 - initialDepositA + removeAmountA
    );
    expect(Number(userTokenAccountDataB.value.amount)).to.equal(
      1000 - initialDepositB + removeAmountB
    );
    expect(Number(poolTokenAccountDataA.value.amount)).to.equal(
      initialDepositA - removeAmountA
    );
    expect(Number(poolTokenAccountDataB.value.amount)).to.equal(
      initialDepositB - removeAmountB
    );
  });
});

describe("solana_swap_swap_tokens", () => {
  // Generate keypairs
  const payer = Keypair.generate();
  const mintAuthority = Keypair.generate();
  const freezeAuthority = Keypair.generate();

  const program = anchor.workspace.SolanaSwap as Program<SolanaSwap>;
  const provider = program.provider as anchor.AnchorProvider;
  const connection = new Connection("http://localhost:8899", "confirmed");

  // accounts
  let pool: Keypair;
  let admin: Keypair;
  let tokenMintA: PublicKey;
  let tokenMintB: PublicKey;
  let userTokenAccountA: PublicKey;
  let userTokenAccountB: PublicKey;
  let poolTokenAccountA: PublicKey;
  let poolTokenAccountB: PublicKey;
  let adminTokenAccount: PublicKey;

  before(async () => {
    pool = Keypair.generate();
    admin = Keypair.generate();

    // Airdrop SOL to the payer account
    const airdropSignature = await connection.requestAirdrop(
      payer.publicKey,
      LAMPORTS_PER_SOL
    );

    const latestBlockHash = await connection.getLatestBlockhash();

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    // Create token mints
    tokenMintA = await createMint(
      connection,
      payer,
      mintAuthority.publicKey,
      freezeAuthority.publicKey,
      9
    );
    tokenMintB = await createMint(
      connection,
      payer,
      mintAuthority.publicKey,
      freezeAuthority.publicKey,
      9
    );

    // Create associated token accounts
    userTokenAccountA = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintA,
        payer.publicKey
      )
    ).address;

    userTokenAccountB = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintB,
        payer.publicKey
      )
    ).address;

    poolTokenAccountA = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintA,
        pool.publicKey
      )
    ).address;

    poolTokenAccountB = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintB,
        pool.publicKey
      )
    ).address;

    adminTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintA,
        admin.publicKey
      )
    ).address;

    // Mint tokens to user accounts
    await mintTo(
      connection,
      payer,
      tokenMintA,
      userTokenAccountA,
      mintAuthority.publicKey,
      1000,
      [mintAuthority]
    );
    await mintTo(
      connection,
      payer,
      tokenMintB,
      userTokenAccountB,
      mintAuthority.publicKey,
      1000,
      [mintAuthority]
    );

    // Initialize the pool
    await program.methods
      .initializePool()
      .accounts({
        pool: pool.publicKey,
        payer: provider.wallet.publicKey,
      })
      .signers([pool])
      .rpc();

    const initialDepositA = 500;
    const initialDepositB = 500;

    // Add liquidity to the pool
    const txinit = await program.methods
      .addLiquidity(
        new anchor.BN(initialDepositA), // Amount of token A
        new anchor.BN(initialDepositB) // Amount of token B
      )
      .accounts({
        pool: pool.publicKey,
        userTokenA: userTokenAccountA,
        userTokenB: userTokenAccountB,
        poolTokenA: poolTokenAccountA,
        poolTokenB: poolTokenAccountB,
        user: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    const latestBlockHashnew = await connection.getLatestBlockhash();

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHashnew.lastValidBlockHeight,
      signature: txinit,
    });

    const userTokenAccountDataA = await connection.getTokenAccountBalance(
      userTokenAccountA
    );
    const userTokenAccountDataB = await connection.getTokenAccountBalance(
      userTokenAccountB
    );
    const poolTokenAccountDataA = await connection.getTokenAccountBalance(
      poolTokenAccountA
    );
    const poolTokenAccountDataB = await connection.getTokenAccountBalance(
      poolTokenAccountB
    );
    const adminTokenAccountData = await connection.getTokenAccountBalance(
      adminTokenAccount
    );

    console.log(
      "Before SWAP User Token Account A Data:",
      userTokenAccountDataA
    );
    console.log(
      "Before SWAP User Token Account B Data:",
      userTokenAccountDataB
    );
    console.log(
      "Before SWAP Pool Token Account A Data:",
      poolTokenAccountDataA
    );
    console.log(
      "Before SWAP Pool Token Account B Data:",
      poolTokenAccountDataB
    );
    console.log("Before SWAP Admin Token Account Data:", adminTokenAccountData);
  });

  it("Swap tokens in the pool", async () => {
    const swapAmountIn = 50; // Amount of Token A to swap
    const minAmountOut = 454; // Minimum amount of Token B to receive

    // Perform the swap
    const tx = await program.methods
      .swap(new anchor.BN(swapAmountIn), new anchor.BN(minAmountOut))
      .accounts({
        pool: pool.publicKey,
        poolAuthority: pool.publicKey,
        userTokenIn: userTokenAccountA,
        userTokenOut: userTokenAccountB,
        poolTokenIn: poolTokenAccountA,
        poolTokenOut: poolTokenAccountB,
        adminTokenAccount: adminTokenAccount,
        user: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer, pool])
      .rpc();

    const latestBlockHash = await connection.getLatestBlockhash();

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: tx,
    });

    // Verify balances
    const userTokenAccountDataA = await connection.getTokenAccountBalance(
      userTokenAccountA
    );
    const userTokenAccountDataB = await connection.getTokenAccountBalance(
      userTokenAccountB
    );
    const poolTokenAccountDataA = await connection.getTokenAccountBalance(
      poolTokenAccountA
    );
    const poolTokenAccountDataB = await connection.getTokenAccountBalance(
      poolTokenAccountB
    );
    const adminTokenAccountData = await connection.getTokenAccountBalance(
      adminTokenAccount
    );

    console.log("User Token Account A Data:", userTokenAccountDataA);
    console.log("User Token Account B Data:", userTokenAccountDataB);
    console.log("Pool Token Account A Data:", poolTokenAccountDataA);
    console.log("Pool Token Account B Data:", poolTokenAccountDataB);
    console.log("Admin Token Account Data:", adminTokenAccountData);

    const expectedUserTokenAAfterSwap = (1000 - 500 - swapAmountIn).toString();
    const expectedUserTokenBAfterSwap = (1000 - 500 + minAmountOut).toString();
    const expectedPoolTokenAAfterSwap = (500 + swapAmountIn).toString();
    const expectedPoolTokenBAfterSwap = (500 - minAmountOut).toString();
    const expectedAdminAccountAfterSwap = (0).toString();

    expect(userTokenAccountDataA.value.amount).to.equal(
      expectedUserTokenAAfterSwap,
      "User Token Account A balance after swap is incorrect"
    );
    expect(userTokenAccountDataB.value.amount).to.equal(
      expectedUserTokenBAfterSwap,
      "User Token Account B balance after swap is incorrect"
    );
    expect(poolTokenAccountDataA.value.amount).to.equal(
      expectedPoolTokenAAfterSwap,
      "Pool Token Account A balance after swap is incorrect"
    );
    expect(poolTokenAccountDataB.value.amount).to.equal(
      expectedPoolTokenBAfterSwap,
      "Pool Token Account B balance after swap is incorrect"
    );
    expect(adminTokenAccountData.value.amount).to.equal(
      expectedAdminAccountAfterSwap,
      "Admin Token Account balance after swap is incorrect"
    );
  });
});
