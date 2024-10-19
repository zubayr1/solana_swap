use crate::instructions::*;
use anchor_lang::prelude::*;

pub mod constants;
pub mod curve;
pub mod errors;
pub mod instructions;
pub mod state;

declare_id!("EkXczcYjaVcmNEUeoKAvK8aNYvSfkAAdLTKYNaLTzCM7");

#[program]
pub mod solana_swap {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        instructions::initialize_pool(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, token_account: Pubkey, amount: u64) -> Result<()> {
        instructions::deposit(ctx, token_account, amount)
    }

    pub fn initialize_pool_token(
        ctx: Context<InitializePoolToken>,
        token_account: Pubkey,
    ) -> Result<()> {
        instructions::initialize_pool_token(ctx, token_account)
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        token_account: Pubkey,
        amount: u64,
    ) -> Result<()> {
        instructions::add_liquidity(ctx, token_account, amount)
    }

    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        token_account: Pubkey,
        amount: u64,
    ) -> Result<()> {
        instructions::remove_liquidity(ctx, token_account, amount)
    }

    pub fn swap(
        ctx: Context<Swap>,
        input_token_account: Pubkey,
        output_token_account: Pubkey,
        input_amount: u64,
        min_output_amount: u64,
    ) -> Result<()> {
        instructions::swap(
            ctx,
            input_token_account,
            output_token_account,
            input_amount,
            min_output_amount,
        )
    }
}
