use crate::errors::SwapError;

pub fn calculate_swap_amount(
    input_amount: u64,
    input_reserve: u64,
    output_reserve: u64,
) -> Result<(u64, u64), SwapError> {
    // Constants
    const FEE: u64 = 3; // 0.3% fee as 3 parts of 1000
    const FEE_DENOMINATOR: u64 = 1000;

    // Calculate the fee
    let fee_amount = input_amount * FEE / FEE_DENOMINATOR;

    // Calculate the input amount after applying the fee
    let input_amount_with_fee = input_amount - fee_amount;

    // Calculate the new reserves after adding the input amount
    let new_input_reserve = input_reserve + input_amount_with_fee;

    // Calculate the output amount based on the constant product formula
    let output_amount = output_reserve
        .checked_mul(input_reserve)
        .ok_or(SwapError::MathError)?
        .checked_div(new_input_reserve)
        .ok_or(SwapError::MathError)?;

    // Return both the output amount and the fee
    Ok((output_amount, fee_amount))
}
