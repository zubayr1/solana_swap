use crate::instructions::*;
use anchor_lang::prelude::*;

pub mod constants;
pub mod curve;
pub mod errors;
pub mod instructions;
pub mod state;

use crate::errors::{FlashFillError, SwapError};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};
use anchor_lang::Discriminator;
use anchor_spl::token::TokenAccount;

use anchor_lang::system_program;

pub const AUTHORITY_SEED: &[u8] = b"authority";

declare_id!("7aEi72qNaX16AJBDhgsmsPvyXuMKCXea9qRA2jVL6Hjg");

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

    // Jupiter swap to sol
    pub fn swap_to_sol(ctx: Context<SwapToSOL>, data: Vec<u8>) -> Result<()> {
        let authority_bump = ctx.bumps.program_authority;
        let wsol_bump = ctx.bumps.program_wsol_account;

        instructions::swap_to_sol(ctx, data, authority_bump, wsol_bump)
    }

    // Jupiter borrow repay
    pub fn borrow(ctx: Context<Borrow>) -> Result<()> {
        let ixs = ctx.accounts.instructions.to_account_info();

        // make sure this isnt a cpi call
        let current_index = load_current_index_checked(&ixs)? as usize;
        let current_ix = load_instruction_at_checked(current_index, &ixs)?;
        if current_ix.program_id != *ctx.program_id {
            return Err(FlashFillError::ProgramMismatch.into());
        }

        // loop through instructions, looking for an equivalent repay to this borrow
        let mut index = current_index + 1; // jupiter swap
        loop {
            // get the next instruction, die if theres no more
            if let Ok(ix) = load_instruction_at_checked(index, &ixs) {
                if ix.program_id == crate::id() {
                    let ix_discriminator: [u8; 8] = ix.data[0..8]
                        .try_into()
                        .map_err(|_| FlashFillError::UnknownInstruction)?;

                    // check if we have a toplevel repay toward the program authority
                    if ix_discriminator == self::instruction::Repay::discriminator() {
                        require_keys_eq!(
                            ix.accounts[1].pubkey,
                            ctx.accounts.program_authority.key(),
                            FlashFillError::IncorrectProgramAuthority
                        );

                        break;
                    } else if ix_discriminator == self::instruction::Borrow::discriminator() {
                        return Err(FlashFillError::CannotBorrowBeforeRepay.into());
                    } else {
                        return Err(FlashFillError::UnknownInstruction.into());
                    }
                }
            } else {
                // no more instructions, so we're missing a repay
                return Err(FlashFillError::MissingRepay.into());
            }

            index += 1
        }

        let authority_bump: [u8; 1] = [ctx.bumps.program_authority];
        let rent = Rent::get()?;
        let space = TokenAccount::LEN;
        let token_lamports = rent.minimum_balance(space);

        // transfer enough SOL to the borrower to open wSOL account.
        let signer_seeds: &[&[&[u8]]] = &[&[AUTHORITY_SEED, authority_bump.as_ref()]];
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.program_authority.to_account_info(),
                    to: ctx.accounts.borrower.to_account_info(),
                },
                signer_seeds,
            ),
            token_lamports,
        )?;

        Ok(())
    }

    pub fn repay(ctx: Context<Repay>) -> Result<()> {
        let ixs = ctx.accounts.instructions.to_account_info();

        // make sure this isnt a cpi call
        let current_index = load_current_index_checked(&ixs)? as usize;
        let current_ix = load_instruction_at_checked(current_index, &ixs)?;
        if current_ix.program_id != *ctx.program_id {
            return Err(FlashFillError::ProgramMismatch.into());
        }

        let rent = Rent::get()?;
        let space = TokenAccount::LEN;
        let token_lamports = rent.minimum_balance(space);

        // transfer borrowed SOL back to the program authority
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.borrower.to_account_info(),
                    to: ctx.accounts.program_authority.to_account_info(),
                },
            ),
            token_lamports,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    pub borrower: Signer<'info>,
    #[account(mut, seeds = [AUTHORITY_SEED], bump)]
    pub program_authority: SystemAccount<'info>,
    /// CHECK: check instructions account
    #[account(address = sysvar::instructions::ID @FlashFillError::AddressMismatch)]
    pub instructions: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Repay<'info> {
    pub borrower: Signer<'info>,
    #[account(mut, seeds = [AUTHORITY_SEED], bump)]
    pub program_authority: SystemAccount<'info>,
    /// CHECK: check instructions account
    #[account(address = sysvar::instructions::ID @FlashFillError::AddressMismatch)]
    pub instructions: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
