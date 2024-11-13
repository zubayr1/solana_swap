use crate::curve::calculate_swap_amount;
use crate::errors::{FlashFillError, SwapError};
use crate::state::Pool;
use crate::state::TokenAmount;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};
use anchor_lang::Discriminator;
use anchor_lang::{
    prelude::*,
    solana_program::{
        entrypoint::ProgramResult, instruction::Instruction, program::invoke_signed, sysvar,
    },
    system_program,
};
use anchor_spl::token::{self, Mint, Token, TokenAccount};

pub const AUTHORITY_SEED: &[u8] = b"authority";
pub const WSOL_SEED: &[u8] = b"wsol";

mod jupiter {
    use anchor_lang::declare_id;
    declare_id!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
}

#[derive(Clone)]
pub struct Jupiter;

impl anchor_lang::Id for Jupiter {
    fn id() -> Pubkey {
        jupiter::id()
    }
}

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
    pub user_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn deposit(ctx: Context<Deposit>, token_account: Pubkey, amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let cpi_program = ctx.accounts.token_program.to_account_info();

    // Ensure the user is depositing to the correct token account
    require!(
        ctx.accounts.user_token.key() == token_account,
        SwapError::InvalidAmount
    );

    // Transfer tokens from user to pool
    let cpi_accounts = token::Transfer {
        from: ctx.accounts.user_token.to_account_info(),
        to: ctx.accounts.pool_token.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program.clone(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Update pool state for the deposited token
    let mut found = false;

    // Check if the token is already in the pool's tokens vector
    for token in &mut pool.tokens {
        if token.token_account == token_account {
            token.amount += amount;
            found = true;
            break;
        }
    }

    // If not found, add the new token to the pool's tokens vector
    if !found {
        pool.tokens.push(TokenAmount {
            token_account,
            amount,
        });
    }

    Ok(())
}

#[derive(Accounts)]
pub struct InitializePoolToken<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub pool_token: Account<'info, TokenAccount>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn initialize_pool_token(
    ctx: Context<InitializePoolToken>,
    token_account: Pubkey,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // Initialize the token in the pool if it's not already added
    if pool
        .tokens
        .iter()
        .any(|token| token.token_account == token_account)
    {
        return Err(SwapError::TokenAlreadyInitialized.into());
    }

    // Add the token account to the pool with an initial amount of 0
    pool.tokens.push(TokenAmount {
        token_account,
        amount: 0,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn add_liquidity(ctx: Context<AddLiquidity>, token_account: Pubkey, amount: u64) -> Result<()> {
    let authority = ctx.accounts.user.to_account_info();
    let pool = &mut ctx.accounts.pool;

    // Transfer tokens from user to pool for the provided token
    let cpi_accounts = token::Transfer {
        from: ctx.accounts.user_token.to_account_info(),
        to: ctx.accounts.pool_token.to_account_info(),
        authority: authority,
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Update the corresponding token's amount in the pool
    if let Some(pool_token) = pool
        .tokens
        .iter_mut()
        .find(|token| token.token_account == token_account)
    {
        pool_token.amount = pool_token
            .amount
            .checked_add(amount)
            .ok_or(SwapError::MathError)?;
    } else {
        return Err(SwapError::TokenNotFound.into()); // Handle token not found in pool
    }

    Ok(())
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn remove_liquidity(
    ctx: Context<RemoveLiquidity>,
    token_account: Pubkey,
    amount: u64,
) -> Result<()> {
    let authority = ctx.accounts.pool.to_account_info();
    let pool = &mut ctx.accounts.pool;

    // Find the token in the pool and validate if there is enough liquidity
    if let Some(pool_token) = pool
        .tokens
        .iter_mut()
        .find(|token| token.token_account == token_account)
    {
        require!(
            pool_token.amount >= amount,
            SwapError::InsufficientLiquidity
        );

        // Transfer tokens from the pool to the user for the given token
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.pool_token.to_account_info(),
            to: ctx.accounts.user_token.to_account_info(),
            authority: authority,
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Update pool state for the token
        pool_token.amount = pool_token
            .amount
            .checked_sub(amount)
            .ok_or(SwapError::MathError)?;
    } else {
        return Err(SwapError::TokenNotFound.into()); // Handle token not found in pool
    }

    Ok(())
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(signer)]
    pub pool_authority: Signer<'info>,
    #[account(mut)]
    pub user_token_in: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_token_out: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_in: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pool_token_out: Account<'info, TokenAccount>,
    #[account(mut)]
    pub admin_token_account: Account<'info, TokenAccount>,
    #[account(signer)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn swap(
    ctx: Context<Swap>,
    input_token_account: Pubkey,
    output_token_account: Pubkey,
    input_amount: u64,
    min_output_amount: u64,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // Validate input amounts
    require!(input_amount > 0, SwapError::InvalidAmount);
    require!(min_output_amount > 0, SwapError::InvalidAmount);

    // Find the input and output tokens in the pool using input_token_account and output_token_account
    let (pool_token_in, pool_token_out) = {
        let mut in_token = None;
        let mut out_token = None;

        // Iterate through pool tokens to find both input and output tokens
        for token in pool.tokens.iter_mut() {
            let selected_token = token.token_account;

            if selected_token == input_token_account {
                in_token = Some(token);
            } else if selected_token == output_token_account {
                out_token = Some(token);
            }
            // Break early if both tokens are found
            if in_token.is_some() && out_token.is_some() {
                break;
            }
        }

        let in_token = in_token.ok_or(SwapError::TokenNotFound)?;
        let out_token = out_token.ok_or(SwapError::TokenNotFound)?;

        (in_token, out_token)
    };

    // Calculate the output amount based on the pool’s reserves and input amount
    let (output_amount, fee_amount) =
        calculate_swap_amount(input_amount, pool_token_in.amount, pool_token_out.amount)?;

    // Ensure the output amount meets the minimum output amount requirement
    require!(output_amount >= min_output_amount, SwapError::SlippageError);

    // Validate pool liquidity
    require!(
        pool_token_in.amount >= input_amount,
        SwapError::InsufficientLiquidity
    );
    require!(
        pool_token_out.amount >= output_amount,
        SwapError::InsufficientLiquidity
    );

    // Transfer fee to the admin account
    let cpi_accounts_fee = token::Transfer {
        from: ctx.accounts.user_token_in.to_account_info(),
        to: ctx.accounts.admin_token_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_ctx_fee = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts_fee,
    );
    token::transfer(cpi_ctx_fee, fee_amount)?;

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
    token::transfer(cpi_ctx_in, input_amount - fee_amount)?;

    // Transfer tokens from pool to user (pool_authority must authorize this)
    let cpi_accounts_out = token::Transfer {
        from: ctx.accounts.pool_token_out.to_account_info(),
        to: ctx.accounts.user_token_out.to_account_info(),
        authority: ctx.accounts.pool_authority.to_account_info(), // Pool authority must authorize this transfer
    };
    let cpi_ctx_out = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts_out,
    );
    token::transfer(cpi_ctx_out, output_amount)?;

    // Update the pool state
    pool_token_in.amount = pool_token_in
        .amount
        .checked_add(input_amount)
        .ok_or(SwapError::MathError)?
        .checked_sub(fee_amount)
        .ok_or(SwapError::MathError)?;
    pool_token_out.amount = pool_token_out
        .amount
        .checked_sub(output_amount)
        .ok_or(SwapError::MathError)?;

    Ok(())
}

#[derive(Accounts)]
pub struct SwapToSOL<'info> {
    #[account(mut, seeds = [AUTHORITY_SEED], bump)]
    pub program_authority: SystemAccount<'info>,
    /// CHECK: This may not be initialized yet.
    #[account(mut, seeds = [WSOL_SEED], bump)]
    pub program_wsol_account: UncheckedAccount<'info>,
    pub user_account: Signer<'info>,
    // #[account(address = spl_token::native_mint::id())]
    pub sol_mint: Account<'info, Mint>,
    pub jupiter_program: Program<'info, Jupiter>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn swap_to_sol(
    ctx: Context<SwapToSOL>,
    data: Vec<u8>,
    authority_bump: u8,
    wsol_bump: u8,
) -> Result<()> {
    create_wsol_token_idempotent(
        ctx.accounts.program_authority.clone(),
        ctx.accounts.program_wsol_account.clone(),
        ctx.accounts.sol_mint.clone(),
        ctx.accounts.token_program.clone(),
        ctx.accounts.system_program.clone(),
        &[authority_bump],
        &[wsol_bump],
    )?;

    msg!("Swap on Jupiter");
    swap_on_jupiter(
        ctx.remaining_accounts,
        ctx.accounts.jupiter_program.clone(),
        data,
    )?;

    let after_swap_lamports = ctx.accounts.program_wsol_account.lamports();

    close_program_wsol(
        ctx.accounts.program_authority.clone(),
        ctx.accounts.program_wsol_account.clone(),
        ctx.accounts.token_program.clone(),
        &[authority_bump],
    )?;

    let rent = Rent::get()?;
    let space = TokenAccount::LEN;
    let token_lamports = rent.minimum_balance(space);
    let out_amount = after_swap_lamports - token_lamports;

    msg!("Transfer SOL to user");
    let signer_seeds: &[&[&[u8]]] = &[&[AUTHORITY_SEED, &[authority_bump]]];
    let lamports = out_amount;

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.program_authority.to_account_info(),
                to: ctx.accounts.user_account.to_account_info(),
            },
            signer_seeds,
        ),
        lamports,
    )?;

    Ok(())
}

fn create_wsol_token_idempotent<'info>(
    program_authority: SystemAccount<'info>,
    program_wsol_account: UncheckedAccount<'info>,
    sol_mint: Account<'info, Mint>,
    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
    authority_bump: &[u8],
    wsol_bump: &[u8],
) -> Result<TokenAccount> {
    if program_wsol_account.data_is_empty() {
        let signer_seeds: &[&[&[u8]]] = &[
            &[AUTHORITY_SEED, authority_bump.as_ref()],
            &[WSOL_SEED, wsol_bump.as_ref()],
        ];

        msg!("Initialize program wSOL account");
        let rent = Rent::get()?;
        let space = TokenAccount::LEN;
        let lamports = rent.minimum_balance(space);
        system_program::create_account(
            CpiContext::new_with_signer(
                system_program.to_account_info(),
                system_program::CreateAccount {
                    from: program_authority.to_account_info(),
                    to: program_wsol_account.to_account_info(),
                },
                signer_seeds,
            ),
            lamports,
            space as u64,
            token_program.key,
        )?;

        msg!("Initialize program wSOL token account");
        token::initialize_account3(CpiContext::new(
            token_program.to_account_info(),
            token::InitializeAccount3 {
                account: program_wsol_account.to_account_info(),
                mint: sol_mint.to_account_info(),
                authority: program_authority.to_account_info(),
            },
        ))?;

        let data = program_wsol_account.try_borrow_data()?;
        let wsol_token_account = TokenAccount::try_deserialize(&mut data.as_ref())?;

        Ok(wsol_token_account)
    } else {
        let data = program_wsol_account.try_borrow_data()?;
        let wsol_token_account = TokenAccount::try_deserialize(&mut data.as_ref())?;
        if &wsol_token_account.owner != program_authority.key {
            // TODO: throw error
            return err!(SwapError::IncorrectOwner);
        }

        Ok(wsol_token_account)
    }
}

fn swap_on_jupiter<'info>(
    remaining_accounts: &[AccountInfo],
    jupiter_program: Program<'info, Jupiter>,
    data: Vec<u8>,
) -> ProgramResult {
    let accounts: Vec<AccountMeta> = remaining_accounts
        .iter()
        .map(|acc| AccountMeta {
            pubkey: *acc.key,
            is_signer: acc.is_signer,
            is_writable: acc.is_writable,
        })
        .collect();

    let accounts_infos: Vec<AccountInfo> = remaining_accounts
        .iter()
        .map(|acc| AccountInfo { ..acc.clone() })
        .collect();

    // TODO: Check the first 8 bytes. Only Jupiter Route CPI allowed.

    invoke_signed(
        &Instruction {
            program_id: *jupiter_program.key,
            accounts,
            data,
        },
        &accounts_infos,
        &[],
    )
}

fn close_program_wsol<'info>(
    program_authority: SystemAccount<'info>,
    program_wsol_account: UncheckedAccount<'info>,
    token_program: Program<'info, Token>,
    authority_bump: &[u8],
) -> Result<()> {
    let signer_seeds: &[&[&[u8]]] = &[&[AUTHORITY_SEED, authority_bump.as_ref()]];

    msg!("Close program wSOL token account");
    token::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        token::CloseAccount {
            account: program_wsol_account.to_account_info(),
            destination: program_authority.to_account_info(),
            authority: program_authority.to_account_info(),
        },
        signer_seeds,
    ))
}
