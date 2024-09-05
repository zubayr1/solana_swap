use crate::errors::SwapError;
use anchor_lang::prelude::*;

pub fn calculate_swap_amount(
    input_amount: u64,
    input_reserve: u64,
    output_reserve: u64,
) -> Result<u64> {
    // Constants
    const FEE: u64 = 997; // 0.3% fee
    const FEE_DENOMINATOR: u64 = 1000;

    // Calculate the input amount with fee applied
    let input_amount_with_fee = input_amount * FEE / FEE_DENOMINATOR;

    // Calculate the new reserves after adding the input amount
    let new_input_reserve = input_reserve + input_amount_with_fee;

    // Calculate the output amount based on the constant product formula
    let output_amount = output_reserve
        .checked_mul(input_reserve)
        .ok_or(SwapError::MathError)?
        .checked_div(new_input_reserve)
        .ok_or(SwapError::MathError)?;

    Ok(output_amount)
}
