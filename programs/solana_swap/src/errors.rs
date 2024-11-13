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

    #[msg("Incorrect Owner")]
    IncorrectOwner,
}

#[error_code]
pub enum FlashFillError {
    #[msg("Address Mismatch")]
    AddressMismatch,
    #[msg("Program Mismatch")]
    ProgramMismatch,
    #[msg("Missing Repay")]
    MissingRepay,
    #[msg("Incorrect Owner")]
    IncorrectOwner,
    #[msg("Incorrect Program Authority")]
    IncorrectProgramAuthority,
    #[msg("Cannot Borrow Before Repay")]
    CannotBorrowBeforeRepay,
    #[msg("Unknown Instruction")]
    UnknownInstruction,
}
