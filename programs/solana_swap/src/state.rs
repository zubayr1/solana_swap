use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TokenAmount {
    pub token_account: Pubkey, // The address of the token account
    pub amount: u64,           // The amount of the token
}

#[account]
pub struct Pool {
    pub authority: Pubkey,
    pub tokens: Vec<TokenAmount>,
}

impl Pool {
    pub const DISCRIMINATOR_LEN: usize = 8; // Discriminator length
    pub const AUTHORITY_LEN: usize = 32; // Length of the authority
    pub const TOKEN_AMOUNT_SIZE: usize = 40; // Size of the TokenAmount struct (32 for Pubkey + 8 for u64)

    pub const MAX_TOKENS: usize = 10; // Example maximum number of tokens

    // Calculate the length of the Pool account
    pub const LEN: usize = Self::DISCRIMINATOR_LEN
        + Self::AUTHORITY_LEN
        + (Self::TOKEN_AMOUNT_SIZE * Self::MAX_TOKENS);
}
