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

    pub fn deposit(ctx: Context<Deposit>, amount_a: u64, amount_b: u64) -> Result<()> {
        instructions::deposit(ctx, amount_a, amount_b)
    }

    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
        instructions::add_liquidity(ctx, amount_a, amount_b)
    }

    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        amount_a: u64,
        amount_b: u64,
    ) -> Result<()> {
        instructions::remove_liquidity(ctx, amount_a, amount_b)
    }

    pub fn swap(ctx: Context<Swap>, input_amount: u64, min_output_amount: u64) -> Result<()> {
        instructions::swap(ctx, input_amount, min_output_amount)
    }
}
