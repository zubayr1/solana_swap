pub fn calculate_swap_amount(amount_in: u64, total_in: u64, total_out: u64) -> u64 {
    // Simple constant product formula: amount_out = (amount_in * total_out) / (total_in + amount_in)
    total_out * amount_in / (total_in + amount_in)
}
