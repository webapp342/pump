//! Pump.fun bonding-curve math (official SDK parity).
//!
//! Source: `@pump-fun/pump-sdk` `bondingCurve.ts` + pump-public-docs.
//! Constant-product on **virtual** reserves; buys capped by **real_token_reserves**.
//! Graduation / migrate intentionally omitted — when real tokens hit 0, buys stop.

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

/// `tokensOut = netSol * virtualToken / (virtualSol + netSol)`, capped by realToken.
pub fn quote_buy(
    sol_in: u64,
    protocol_fee_bps: u64,
    virtual_sol_reserves: u64,
    virtual_token_reserves: u64,
    real_token_reserves: u64,
) -> Option<BuyQuote> {
    if sol_in == 0 || virtual_sol_reserves == 0 || virtual_token_reserves == 0 {
        return None;
    }
    if real_token_reserves == 0 {
        return None;
    }

    let fee_lamports = (sol_in as u128)
        .checked_mul(protocol_fee_bps as u128)?
        .checked_div(BPS as u128)? as u64;
    let net_lamports = sol_in.checked_sub(fee_lamports)?;
    if net_lamports == 0 {
        return None;
    }

    // pump.fun: inputAmount * virtualTokenReserves / (virtualSolReserves + inputAmount)
    let token_out = (net_lamports as u128)
        .checked_mul(virtual_token_reserves as u128)?
        .checked_div(
            (virtual_sol_reserves as u128).checked_add(net_lamports as u128)?,
        )?;

    if token_out == 0 || token_out > u64::MAX as u128 {
        return None;
    }
    let mut token_out = token_out as u64;
    if token_out > real_token_reserves {
        token_out = real_token_reserves;
    }
    if token_out == 0 {
        return None;
    }

    Some(BuyQuote {
        token_out,
        fee_lamports,
        net_lamports,
    })
}

/// `solOut = tokenIn * virtualSol / (virtualToken + tokenIn)`, capped by realSol; fee from gross.
pub fn quote_sell(
    token_in: u64,
    protocol_fee_bps: u64,
    virtual_sol_reserves: u64,
    virtual_token_reserves: u64,
    real_sol_reserves: u64,
) -> Option<SellQuote> {
    if token_in == 0 || virtual_sol_reserves == 0 || virtual_token_reserves == 0 {
        return None;
    }
    if real_sol_reserves == 0 {
        return None;
    }

    // pump.fun: tokenAmount * virtualSolReserves / (virtualTokenReserves + tokenAmount)
    let mut gross = (token_in as u128)
        .checked_mul(virtual_sol_reserves as u128)?
        .checked_div(
            (virtual_token_reserves as u128).checked_add(token_in as u128)?,
        )?;

    if gross > real_sol_reserves as u128 {
        gross = real_sol_reserves as u128;
    }
    let gross_lamports = gross as u64;
    if gross_lamports == 0 {
        return None;
    }

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

/// Spot: lamports per TOKEN_UNIT base units (virtual reserves only — pump.fun style).
pub fn spot_price_lamports_per_token(
    virtual_sol_reserves: u64,
    virtual_token_reserves: u64,
    token_unit: u64,
) -> u64 {
    if virtual_token_reserves == 0 {
        return 0;
    }
    ((virtual_sol_reserves as u128).saturating_mul(token_unit as u128)
        / virtual_token_reserves as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buy_caps_at_real_reserves() {
        let q = quote_buy(
            1_000_000_000,
            125,
            30_000_000_000,
            1_073_000_000_000_000,
            1_000, // tiny real
        )
        .unwrap();
        assert_eq!(q.token_out, 1_000);
    }

    #[test]
    fn buy_zero_real_fails() {
        assert!(quote_buy(1_000_000_000, 125, 30_000_000_000, 1_073_000_000_000_000, 0).is_none());
    }
}
