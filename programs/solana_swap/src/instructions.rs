use crate::curve::calculate_swap_amount;
use crate::errors::SwapError;
use crate::state::Pool;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(init, payer = payer, space = Pool::LEN)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.payer.key();
    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn deposit(ctx: Context<Deposit>, amount_a: u64, amount_b: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let cpi_program = ctx.accounts.token_program.to_account_info(); // Clone the CPI program

    // Transfer tokens from user to pool for token A
    let cpi_accounts_a = token::Transfer {
        from: ctx.accounts.user_token_a.to_account_info(),
        to: ctx.accounts.pool_token_a.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx_a = CpiContext::new(cpi_program.clone(), cpi_accounts_a); // Use the cloned CPI program
    token::transfer(cpi_ctx_a, amount_a)?;

    // Transfer tokens from user to pool for token B
    let cpi_accounts_b = token::Transfer {
        from: ctx.accounts.user_token_b.to_account_info(),
        to: ctx.accounts.pool_token_b.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx_b = CpiContext::new(cpi_program.clone(), cpi_accounts_b); // Use the cloned CPI program
    token::transfer(cpi_ctx_b, amount_b)?;

    // Update pool state
    pool.token_a_amount += amount_a;
    pool.token_b_amount += amount_b;

    Ok(())
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn add_liquidity(ctx: Context<AddLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // Transfer tokens from user to pool for token A
    let cpi_accounts_a = token::Transfer {
        from: ctx.accounts.user_token_a.to_account_info(),
        to: ctx.accounts.pool_token_a.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx_a = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_a);
    token::transfer(cpi_ctx_a, amount_a)?;

    // Transfer tokens from user to pool for token B
    let cpi_accounts_b = token::Transfer {
        from: ctx.accounts.user_token_b.to_account_info(),
        to: ctx.accounts.pool_token_b.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx_b = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_b);
    token::transfer(cpi_ctx_b, amount_b)?;

    // Update pool state
    pool.token_a_amount = pool
        .token_a_amount
        .checked_add(amount_a)
        .ok_or(SwapError::MathError)?;
    pool.token_b_amount = pool
        .token_b_amount
        .checked_add(amount_b)
        .ok_or(SwapError::MathError)?;

    Ok(())
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_a: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_b: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn remove_liquidity(ctx: Context<RemoveLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool.clone();

    // Validate that the pool has enough liquidity to remove
    require!(
        pool.token_a_amount >= amount_a && pool.token_b_amount >= amount_b,
        SwapError::InsufficientLiquidity
    );

    // Transfer tokens from the pool to the user for Token A
    let cpi_accounts_a = token::Transfer {
        from: ctx.accounts.pool_token_a.to_account_info(),
        to: ctx.accounts.user_token_a.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(), // Authority here is the pool
    };
    let cpi_ctx_a = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_a);
    token::transfer(cpi_ctx_a, amount_a)?;

    // Transfer tokens from the pool to the user for Token B
    let cpi_accounts_b = token::Transfer {
        from: ctx.accounts.pool_token_b.to_account_info(),
        to: ctx.accounts.user_token_b.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(), // Authority here is the pool
    };
    let cpi_ctx_b = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_b);
    token::transfer(cpi_ctx_b, amount_b)?;

    // Update pool state
    pool.token_a_amount = pool
        .token_a_amount
        .checked_sub(amount_a)
        .ok_or(SwapError::MathError)?;
    pool.token_b_amount = pool
        .token_b_amount
        .checked_sub(amount_b)
        .ok_or(SwapError::MathError)?;

    Ok(())
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub user_token_in: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_out: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_in: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_out: Account<'info, TokenAccount>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn swap(ctx: Context<Swap>, amount_in: u64, min_amount_out: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool.clone();

    // Validate input amounts
    require!(amount_in > 0, SwapError::InvalidAmount);
    require!(min_amount_out > 0, SwapError::InvalidAmount);

    // Calculate the output amount based on the pool’s reserves and input amount
    let output_amount = calculate_swap_amount(amount_in, pool.token_a_amount, pool.token_b_amount)?;

    // Ensure that the calculated output amount meets the minimum amount out requirement
    require!(output_amount >= min_amount_out, SwapError::SlippageError);

    // Validate pool liquidity
    require!(
        pool.token_a_amount >= amount_in,
        SwapError::InsufficientLiquidity
    );
    require!(
        pool.token_b_amount >= output_amount,
        SwapError::InsufficientLiquidity
    );

    // Transfer tokens from user to pool
    let cpi_accounts_in = token::Transfer {
        from: ctx.accounts.user_token_in.to_account_info(),
        to: ctx.accounts.pool_token_in.to_account_info(),
        authority: ctx.accounts.user.to_account_info(), // User must authorize this transfer
    };
    let cpi_ctx_in = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts_in,
    );
    token::transfer(cpi_ctx_in, amount_in)?;

    // Transfer tokens from pool to user
    let cpi_accounts_out = token::Transfer {
        from: ctx.accounts.pool_token_out.to_account_info(),
        to: ctx.accounts.user_token_out.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(), // Pool must be the authority for this transfer
    };
    let cpi_ctx_out = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts_out,
    );
    token::transfer(cpi_ctx_out, output_amount)?;

    // Update pool state
    pool.token_a_amount = pool
        .token_a_amount
        .checked_add(amount_in)
        .ok_or(SwapError::MathError)?;
    pool.token_b_amount = pool
        .token_b_amount
        .checked_sub(output_amount)
        .ok_or(SwapError::MathError)?;

    Ok(())
}
