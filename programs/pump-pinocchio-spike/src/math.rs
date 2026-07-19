//! Constant-product quotes — parity with EVM / pump-curve math.
use crate::BPS;

pub struct BuyQuote {
    pub token_out: u64,
    pub fee_lamports: u64,
    pub net_lamports: u64,
}

pub struct SellQuote {
    pub lamports_out: u64,
    pub fee_lamports: u64,
    pub gross_lamports: u64,
}

pub fn quote_buy(
    sol_in: u64,
    protocol_fee_bps: u64,
    virtual_sol_reserve: u64,
    virtual_token_reserve: u64,
    reserve_sol: u64,
    sold_tokens: u64,
) -> Option<BuyQuote> {
    if sol_in == 0 {
        return None;
    }
    let fee_lamports = (sol_in as u128)
        .checked_mul(protocol_fee_bps as u128)?
        .checked_div(BPS as u128)? as u64;
    let net_lamports = sol_in.checked_sub(fee_lamports)?;

    let x0 = (virtual_sol_reserve as u128).checked_add(reserve_sol as u128)?;
    let y0 = (virtual_token_reserve as u128).checked_sub(sold_tokens as u128)?;
    if y0 == 0 {
        return None;
    }
    let k = x0.checked_mul(y0)?;
    let x1 = x0.checked_add(net_lamports as u128)?;
    if x1 == 0 {
        return None;
    }
    let y1 = k.checked_div(x1)?;
    let token_out = y0.checked_sub(y1)?;
    if token_out == 0 || token_out > u64::MAX as u128 {
        return None;
    }
    Some(BuyQuote {
        token_out: token_out as u64,
        fee_lamports,
        net_lamports,
    })
}

pub fn quote_sell(
    token_in: u64,
    protocol_fee_bps: u64,
    virtual_sol_reserve: u64,
    virtual_token_reserve: u64,
    reserve_sol: u64,
    sold_tokens: u64,
) -> Option<SellQuote> {
    if token_in == 0 {
        return None;
    }
    let x0 = (virtual_sol_reserve as u128).checked_add(reserve_sol as u128)?;
    let y0 = (virtual_token_reserve as u128).checked_sub(sold_tokens as u128)?;
    let k = x0.checked_mul(y0)?;
    let y1 = y0.checked_add(token_in as u128)?;
    if y1 == 0 {
        return None;
    }
    let x1 = k.checked_div(y1)?;
    let mut gross = x0.checked_sub(x1)?;
    let reserve = reserve_sol as u128;
    if gross > reserve {
        gross = reserve;
    }
    let gross_lamports = gross as u64;
    let fee_lamports = (gross as u128)
        .checked_mul(protocol_fee_bps as u128)?
        .checked_div(BPS as u128)? as u64;
    let lamports_out = gross_lamports.checked_sub(fee_lamports)?;
    if lamports_out == 0 {
        return None;
    }
    Some(SellQuote {
        lamports_out,
        fee_lamports,
        gross_lamports,
    })
}
