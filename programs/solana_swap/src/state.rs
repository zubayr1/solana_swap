// state.rs

use anchor_lang::prelude::*;

#[account]
pub struct Pool {
    pub authority: Pubkey,
    pub token_a_amount: u64,
    pub token_b_amount: u64,
    // Other fields as needed
}

impl Pool {
    pub const LEN: usize = 8 + // Discriminator
        32 + // authority
        8 + // token_a_amount
        8; // token_b_amount
}
