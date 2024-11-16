# SOLANA TOKEN SWAP PROGRAM

This project implements a decentralized token swap program on the Solana blockchain. Users can swap tokens, add and remove liquidity, and an admin receives fees from swaps.

## FEATURES:

1. Token Swapping: Allows users to swap between two tokens (e.g., USDT and wBTC).
2. Add Liquidity: Liquidity providers can add tokens to the pool.
3. Remove Liquidity: Providers can remove their liquidity from the pool.
4. Fee Mechanism: A fee is applied to swaps and transferred to an admin account.
5. Jupiter Swap to SOL
6. Jupiter Borrow and Repay

## REQUIREMENTS:

- Rust & Cargo (for Solana program development)
- Solana CLI tools
- Anchor framework
- Phantom wallet for interaction

## SETUP:

1. Install Solana CLI: https://docs.solana.com/cli/install-solana-cli-tools
2. Install Anchor: https://book.anchor-lang.com/getting_started/installation.html
3. Configure Solana for Devnet:
   solana config set --url https://api.devnet.solana.com

## DEPLOYMENT:

1. Update Anchor.toml with correct Program ID and cluster.
2. Deploy the program to Devnet:

```rust
anchor build
anchor deploy
```

3. Verify deployment:

```rust
solana program show <ProgramID>
```

## USAGES:

1. Create the necessary token accounts for two tokens (Token A and Token B), pool accounts, and admin account using the Solana CLI.
2. Use the program to:
   a. Add Liquidity
   b. Remove Liquidity
   c. Swap Tokens
