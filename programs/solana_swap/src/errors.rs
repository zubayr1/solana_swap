use anchor_lang::prelude::*;

#[error_code]
pub enum SwapError {
    #[msg("Bump seed not found.")]
    BumpNotFound,

    #[msg("Math error in calculation.")]
    MathError,

    #[msg("Insufficient liquidity in the pool.")]
    InsufficientLiquidity,

    #[msg("Slippage error.")]
    SlippageError,

    #[msg("Invalid amount.")]
    InvalidAmount,

    #[msg("Token invalid.")]
    TokenNotFound,

    #[msg("Token already initialized.")]
    TokenAlreadyInitialized,
}
