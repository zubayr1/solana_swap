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
  let userTokenAccountC: PublicKey;
  let poolTokenAccountA: PublicKey;
  let poolTokenAccountB: PublicKey;
  let poolTokenAccountC: PublicKey;
  let tokenMintA: PublicKey;
  let tokenMintB: PublicKey;
  let tokenMintC: PublicKey;

  const connection = new Connection("http://127.0.0.1:8899", "confirmed");

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

    tokenMintC = await createMint(
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

    userTokenAccountC = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintC,
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

    poolTokenAccountC = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintC,
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

    await mintTo(
      connection,
      payer,
      tokenMintC,
      userTokenAccountC,
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
      .signers([pool]) // Sign with the pool account's keypair
      .rpc();

    // Deposit amounts
    const depositAmountA = 100;
    const depositAmountB = 200;
    const depositAmountC = 300;

    // Call the deposit function for token A
    const txA = await program.methods
      .deposit(userTokenAccountA, new anchor.BN(depositAmountA))
      .accounts({
        pool: pool.publicKey,
        userToken: userTokenAccountA,
        poolToken: poolTokenAccountA,
        user: payer.publicKey,
        token_program: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    console.log("Deposit transaction signature for token A:", txA);

    // Call the deposit function for token B
    const txB = await program.methods
      .deposit(userTokenAccountB, new anchor.BN(depositAmountB))
      .accounts({
        pool: pool.publicKey,
        userToken: userTokenAccountB,
        poolToken: poolTokenAccountB,
        user: payer.publicKey,
        token_program: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    console.log("Deposit transaction signature for token B:", txB);

    // Call the deposit function for token C
    const txC = await program.methods
      .deposit(userTokenAccountC, new anchor.BN(depositAmountC))
      .accounts({
        pool: pool.publicKey,
        userToken: userTokenAccountC,
        poolToken: poolTokenAccountC,
        user: payer.publicKey,
        token_program: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    console.log("Deposit transaction signature for token C:", txC);

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
    const userTokenAccountDataC = await connection.getTokenAccountBalance(
      userTokenAccountC
    );

    const poolTokenAccountDataA = await connection.getTokenAccountBalance(
      poolTokenAccountA
    );
    const poolTokenAccountDataB = await connection.getTokenAccountBalance(
      poolTokenAccountB
    );
    const poolTokenAccountDataC = await connection.getTokenAccountBalance(
      poolTokenAccountC
    );

    const tokenAmountA = poolAccount.tokens.find(
      (token) => token.tokenAccount.toString() === userTokenAccountA.toString()
    )?.amount;

    const tokenAmountB = poolAccount.tokens.find(
      (token) => token.tokenAccount.toString() === userTokenAccountB.toString()
    )?.amount;

    const tokenAmountC = poolAccount.tokens.find(
      (token) => token.tokenAccount.toString() === userTokenAccountC.toString()
    )?.amount;

    // Add assertions
    expect(tokenAmountA?.toNumber()).to.equal(depositAmountA);
    expect(tokenAmountB?.toNumber()).to.equal(depositAmountB);
    expect(tokenAmountC?.toNumber()).to.equal(depositAmountC);

    expect(Number(poolTokenAccountDataA.value.amount)).to.equal(depositAmountA);
    expect(Number(poolTokenAccountDataB.value.amount)).to.equal(depositAmountB);
    expect(Number(poolTokenAccountDataC.value.amount)).to.equal(depositAmountC);

    // Check token account balances
    expect(Number(userTokenAccountDataA.value.amount)).to.equal(
      1000 - depositAmountA
    );
    expect(Number(userTokenAccountDataB.value.amount)).to.equal(
      1000 - depositAmountB
    );
    expect(Number(userTokenAccountDataC.value.amount)).to.equal(
      1000 - depositAmountC
    );
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
  let userTokenAccountC: PublicKey;
  let poolTokenAccountA: PublicKey;
  let poolTokenAccountB: PublicKey;
  let poolTokenAccountC: PublicKey;
  let tokenMintA: PublicKey;
  let tokenMintB: PublicKey;
  let tokenMintC: PublicKey;

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
    tokenMintC = await createMint(
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
    userTokenAccountC = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintC,
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
    poolTokenAccountC = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        tokenMintC,
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
    await mintTo(
      connection,
      payer,
      tokenMintC,
      userTokenAccountC,
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
    // Step 1: Initialize pool token for Token A
    const txInitPoolTokenA = await program.methods
      .initializePoolToken(userTokenAccountA)
      .accounts({
        pool: pool.publicKey,
        user: payer.publicKey,
        poolToken: poolTokenAccountA,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([payer])
      .rpc();

    const initialBlockHashA = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: initialBlockHashA.blockhash,
      lastValidBlockHeight: initialBlockHashA.lastValidBlockHeight,
      signature: txInitPoolTokenA,
    });

    // Step 2: Initialize pool token for Token B
    const txInitPoolTokenB = await program.methods
      .initializePoolToken(userTokenAccountB)
      .accounts({
        pool: pool.publicKey,
        user: payer.publicKey,
        poolToken: poolTokenAccountB,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([payer])
      .rpc();

    const initialBlockHashB = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: initialBlockHashB.blockhash,
      lastValidBlockHeight: initialBlockHashB.lastValidBlockHeight,
      signature: txInitPoolTokenB,
    });

    // Step 3: Initialize pool token for Token C
    const txInitPoolTokenC = await program.methods
      .initializePoolToken(userTokenAccountC)
      .accounts({
        pool: pool.publicKey,
        user: payer.publicKey,
        poolToken: poolTokenAccountC,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([payer])
      .rpc();

    const initialBlockHashC = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: initialBlockHashC.blockhash,
      lastValidBlockHeight: initialBlockHashC.lastValidBlockHeight,
      signature: txInitPoolTokenC,
    });

    const tokenDepositA = 700;
    const tokenDepositB = 500;
    const tokenDepositC = 200;

    // First, deposit some liquidity to TokenA
    const txA = await program.methods
      .addLiquidity(userTokenAccountA, new anchor.BN(tokenDepositA))
      .accounts({
        pool: pool.publicKey,
        userToken: userTokenAccountA, // User's TokenA account
        poolToken: poolTokenAccountA, // Pool's TokenA account
        user: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([payer])
      .rpc();

    const latestBlockHashA = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHashA.blockhash,
      lastValidBlockHeight: latestBlockHashA.lastValidBlockHeight,
      signature: txA,
    });

    // Then, deposit liquidity to TokenB
    const txB = await program.methods
      .addLiquidity(userTokenAccountB, new anchor.BN(tokenDepositB))
      .accounts({
        pool: pool.publicKey,
        userToken: userTokenAccountB, // User's TokenB account
        poolToken: poolTokenAccountB, // Pool's TokenB account
        user: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([payer])
      .rpc();

    const latestBlockHashB = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHashB.blockhash,
      lastValidBlockHeight: latestBlockHashB.lastValidBlockHeight,
      signature: txB,
    });

    // Then, deposit liquidity to TokenC
    const txC = await program.methods
      .addLiquidity(userTokenAccountC, new anchor.BN(tokenDepositC))
      .accounts({
        pool: pool.publicKey,
        userToken: userTokenAccountC, // User's TokenC account
        poolToken: poolTokenAccountC, // Pool's TokenC account
        user: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([payer])
      .rpc();

    const latestBlockHashC = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHashC.blockhash,
      lastValidBlockHeight: latestBlockHashC.lastValidBlockHeight,
      signature: txB,
    });

    // Fetch account balances after adding liquidity for both tokens
    const poolTokenAccountDataA = await connection.getTokenAccountBalance(
      poolTokenAccountA
    );
    const poolTokenAccountDataB = await connection.getTokenAccountBalance(
      poolTokenAccountB
    );
    const poolTokenAccountDataC = await connection.getTokenAccountBalance(
      poolTokenAccountC
    );

    const userTokenAccountDataA = await connection.getTokenAccountBalance(
      userTokenAccountA
    );
    const userTokenAccountDataB = await connection.getTokenAccountBalance(
      userTokenAccountB
    );
    const userTokenAccountDataC = await connection.getTokenAccountBalance(
      userTokenAccountC
    );

    console.log("User Token Account A Data:", userTokenAccountDataA);
    console.log("User Token Account B Data:", userTokenAccountDataB);
    console.log("User Token Account C Data:", userTokenAccountDataC);

    console.log("Pool Token Account A Data:", poolTokenAccountDataA);
    console.log("Pool Token Account B Data:", poolTokenAccountDataB);
    console.log("Pool Token Account C Data:", poolTokenAccountDataC);

    // Now remove liquidity from TokenA and TokenB
    const removeAmountA = 200;
    const removeAmountB = 100;
    const removeAmountC = 500; // deliberately larger amount

    // Remove liquidity from TokenA
    const txRemoveA = await program.methods
      .removeLiquidity(userTokenAccountA, new anchor.BN(removeAmountA))
      .accounts({
        pool: pool.publicKey,
        userToken: userTokenAccountA, // User's TokenA account
        poolToken: poolTokenAccountA, // Pool's TokenA account
        user: pool.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([pool])
      .rpc();

    const latestBlockHashRemoveA = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHashRemoveA.blockhash,
      lastValidBlockHeight: latestBlockHashRemoveA.lastValidBlockHeight,
      signature: txRemoveA,
    });

    // Remove liquidity from TokenB
    const txRemoveB = await program.methods
      .removeLiquidity(userTokenAccountB, new anchor.BN(removeAmountB))
      .accounts({
        pool: pool.publicKey,
        userToken: userTokenAccountB, // User's TokenB account
        poolToken: poolTokenAccountB, // Pool's TokenB account
        user: pool.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([pool])
      .rpc();

    const latestBlockHashRemoveB = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHashRemoveB.blockhash,
      lastValidBlockHeight: latestBlockHashRemoveB.lastValidBlockHeight,
      signature: txRemoveB,
    });

    try {
      // Attempt to remove liquidity with an amount greater than the pool has
      const txRemoveC = await program.methods
        .removeLiquidity(userTokenAccountC, new anchor.BN(removeAmountC))
        .accounts({
          pool: pool.publicKey,
          userToken: userTokenAccountC, // User's TokenC account
          poolToken: poolTokenAccountC, // Pool's TokenC account
          user: pool.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
        })
        .signers([pool])
        .rpc();

      const latestBlockHashRemoveC = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        blockhash: latestBlockHashRemoveC.blockhash,
        lastValidBlockHeight: latestBlockHashRemoveC.lastValidBlockHeight,
        signature: txRemoveC,
      });

      // If no error is thrown, the assertion below will fail
      expect.fail(
        "Expected InsufficientLiquidity error, but no error was thrown"
      );
    } catch (error) {
      // Expect the error to be an AnchorError and to have the correct code and message
      expect(error.error.errorCode.code).to.equal("InsufficientLiquidity");
      expect(error.error.errorCode.number).to.equal(6002);
      expect(error.error.errorMessage).to.equal(
        "Insufficient liquidity in the pool."
      );

      console.log("Caught expected InsufficientLiquidity error as assertion");
    }

    // Fetch balances after removing liquidity
    const poolTokenAccountDataAfterA = await connection.getTokenAccountBalance(
      poolTokenAccountA
    );
    const poolTokenAccountDataAfterB = await connection.getTokenAccountBalance(
      poolTokenAccountB
    );
    const poolTokenAccountDataAfterC = await connection.getTokenAccountBalance(
      poolTokenAccountC
    );

    const userTokenAccountDataAfterA = await connection.getTokenAccountBalance(
      userTokenAccountA
    );
    const userTokenAccountDataAfterB = await connection.getTokenAccountBalance(
      userTokenAccountB
    );
    const userTokenAccountDataAfterC = await connection.getTokenAccountBalance(
      userTokenAccountC
    );

    console.log("AFTER User Token Account A Data:", userTokenAccountDataAfterA);
    console.log("AFTER User Token Account B Data:", userTokenAccountDataAfterB);
    console.log("AFTER User Token Account C Data:", userTokenAccountDataAfterC);

    console.log("AFTER Pool Token Account A Data:", poolTokenAccountDataAfterA);
    console.log("AFTER Pool Token Account B Data:", poolTokenAccountDataAfterB);
    console.log("AFTER Pool Token Account C Data:", poolTokenAccountDataAfterC);

    // Add assertions
    const poolAccount = await program.account.pool.fetch(pool.publicKey);
    console.log("Pool account data after deposit:", poolAccount);

    const tokenAmountA = poolAccount.tokens.find(
      (token) => token.tokenAccount.toString() === userTokenAccountA.toString()
    )?.amount;

    const tokenAmountB = poolAccount.tokens.find(
      (token) => token.tokenAccount.toString() === userTokenAccountB.toString()
    )?.amount;

    const tokenAmountC = poolAccount.tokens.find(
      (token) => token.tokenAccount.toString() === userTokenAccountC.toString()
    )?.amount;

    expect(tokenAmountA?.toNumber()).to.equal(tokenDepositA - removeAmountA);
    expect(tokenAmountB?.toNumber()).to.equal(tokenDepositB - removeAmountB);
    expect(tokenAmountC?.toNumber()).to.equal(tokenDepositC);

    expect(Number(userTokenAccountDataAfterA.value.amount)).to.equal(
      1000 - tokenDepositA + removeAmountA
    );
    expect(Number(userTokenAccountDataAfterB.value.amount)).to.equal(
      1000 - tokenDepositB + removeAmountB
    );
    expect(Number(userTokenAccountDataAfterC.value.amount)).to.equal(
      1000 - tokenDepositC
    );

    expect(Number(poolTokenAccountDataAfterA.value.amount)).to.equal(
      tokenDepositA - removeAmountA
    );
    expect(Number(poolTokenAccountDataAfterB.value.amount)).to.equal(
      tokenDepositB - removeAmountB
    );
    expect(Number(poolTokenAccountDataAfterC.value.amount)).to.equal(
      tokenDepositC
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

  // Accounts
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

    // Step 1: Initialize pool token for Token A
    const txInitPoolTokenA = await program.methods
      .initializePoolToken(userTokenAccountA)
      .accounts({
        pool: pool.publicKey,
        user: payer.publicKey,
        poolToken: poolTokenAccountA,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([payer])
      .rpc();

    const initialBlockHashA = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: initialBlockHashA.blockhash,
      lastValidBlockHeight: initialBlockHashA.lastValidBlockHeight,
      signature: txInitPoolTokenA,
    });

    // Step 2: Initialize pool token for Token B
    const txInitPoolTokenB = await program.methods
      .initializePoolToken(userTokenAccountB)
      .accounts({
        pool: pool.publicKey,
        user: payer.publicKey,
        poolToken: poolTokenAccountB,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([payer])
      .rpc();

    const initialBlockHashB = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: initialBlockHashB.blockhash,
      lastValidBlockHeight: initialBlockHashB.lastValidBlockHeight,
      signature: txInitPoolTokenB,
    });

    const tokenDepositA = 500;
    const tokenDepositB = 500;

    // First, deposit some liquidity to TokenA
    const txA = await program.methods
      .addLiquidity(userTokenAccountA, new anchor.BN(tokenDepositA))
      .accounts({
        pool: pool.publicKey,
        userToken: userTokenAccountA, // User's TokenA account
        poolToken: poolTokenAccountA, // Pool's TokenA account
        user: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([payer])
      .rpc();

    const latestBlockHashA = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHashA.blockhash,
      lastValidBlockHeight: latestBlockHashA.lastValidBlockHeight,
      signature: txA,
    });

    // Then, deposit liquidity to TokenB
    const txB = await program.methods
      .addLiquidity(userTokenAccountB, new anchor.BN(tokenDepositB))
      .accounts({
        pool: pool.publicKey,
        userToken: userTokenAccountB, // User's TokenB account
        poolToken: poolTokenAccountB, // Pool's TokenB account
        user: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, // Token program ID
      })
      .signers([payer])
      .rpc();

    const latestBlockHashB = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHashB.blockhash,
      lastValidBlockHeight: latestBlockHashB.lastValidBlockHeight,
      signature: txB,
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
      .swap(
        userTokenAccountA, // Input token account (Token A)
        userTokenAccountB, // Output token account (Token B)
        new anchor.BN(swapAmountIn), // Amount of Token A to swap
        new anchor.BN(minAmountOut) // Minimum amount of Token B to receive
      )
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
