//! Pump.fun bonding-curve math + post-complete AMM (real reserves).
//!
//! Bonding: constant-product on **virtual** reserves; buys capped by **real_token_reserves**.
//! AMM phase (`complete=1`): Uniswap V2-style CPMM on **real_sol × vault token** (fee on SOL first).

use crate::BPS;

pub struct BuyQuote {
    pub token_out: u64,
    pub fee_lamports: u64,
    pub net_lamports: u64,
    /// Lamports debited from trader (may be < sol_in when bonding buy hits real cap).
    pub gross_lamports: u64,
}

pub struct SellQuote {
    pub lamports_out: u64,
    pub fee_lamports: u64,
    pub gross_lamports: u64,
}

fn fee_from_gross(gross: u64, protocol_fee_bps: u64) -> Option<u64> {
    Some(
        ((gross as u128)
            .checked_mul(protocol_fee_bps as u128)?
            .checked_div(BPS as u128)?) as u64,
    )
}

/// gross such that `gross - fee(gross) == net` (round gross up).
fn gross_from_net(net: u64, protocol_fee_bps: u64) -> Option<u64> {
    if net == 0 {
        return None;
    }
    let num = BPS - protocol_fee_bps;
    if num == 0 {
        return None;
    }
    Some(
        ((net as u128)
            .checked_mul(BPS as u128)?
            .checked_add(num as u128 - 1)?
            .checked_div(num as u128)?) as u64,
    )
}

fn net_from_token_out_bonding(
    token_out: u64,
    virtual_sol_reserves: u64,
    virtual_token_reserves: u64,
) -> Option<u64> {
    if token_out == 0 || virtual_token_reserves <= token_out {
        return None;
    }
    Some(
        ((token_out as u128)
            .checked_mul(virtual_sol_reserves as u128)?
            .checked_div(
                (virtual_token_reserves as u128).checked_sub(token_out as u128)?,
            )?) as u64,
    )
}

/// Bonding buy: virtual CPMM, capped by real token inventory.
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

    let fee_lamports = fee_from_gross(sol_in, protocol_fee_bps)?;
    let net_lamports = sol_in.checked_sub(fee_lamports)?;
    if net_lamports == 0 {
        return None;
    }

    let uncapped = (net_lamports as u128)
        .checked_mul(virtual_token_reserves as u128)?
        .checked_div(
            (virtual_sol_reserves as u128).checked_add(net_lamports as u128)?,
        )?;

    if uncapped == 0 || uncapped > u64::MAX as u128 {
        return None;
    }
    let uncapped = uncapped as u64;

    let token_out = core::cmp::min(uncapped, real_token_reserves);
    if token_out == 0 {
        return None;
    }

    let (net_lamports, fee_lamports, gross_lamports) = if token_out < uncapped {
        let net = net_from_token_out_bonding(
            token_out,
            virtual_sol_reserves,
            virtual_token_reserves,
        )?;
        let gross = gross_from_net(net, protocol_fee_bps)?;
        let fee = gross.checked_sub(net)?;
        (net, fee, gross)
    } else {
        (net_lamports, fee_lamports, sol_in)
    };

    if gross_lamports > sol_in {
        return None;
    }

    Some(BuyQuote {
        token_out,
        fee_lamports,
        net_lamports,
        gross_lamports,
    })
}

/// Bonding sell: virtual CPMM, capped by real SOL inventory.
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

    let fee_lamports = fee_from_gross(gross_lamports, protocol_fee_bps)?;
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

/// AMM-phase buy: real quote (SOL) × base (tokens), fee on SOL in first.
pub fn quote_amm_buy(
    sol_in: u64,
    protocol_fee_bps: u64,
    quote_reserves: u64,
    base_reserves: u64,
) -> Option<BuyQuote> {
    if sol_in == 0 || quote_reserves == 0 || base_reserves == 0 {
        return None;
    }

    let fee_lamports = fee_from_gross(sol_in, protocol_fee_bps)?;
    let net_lamports = sol_in.checked_sub(fee_lamports)?;
    if net_lamports == 0 {
        return None;
    }

    let token_out = (net_lamports as u128)
        .checked_mul(base_reserves as u128)?
        .checked_div((quote_reserves as u128).checked_add(net_lamports as u128)?)?;

    if token_out == 0 || token_out > u64::MAX as u128 {
        return None;
    }
    let token_out = token_out as u64;
    if token_out > base_reserves {
        return None;
    }

    Some(BuyQuote {
        token_out,
        fee_lamports,
        net_lamports,
        gross_lamports: sol_in,
    })
}

/// AMM-phase sell: real reserves, fee on SOL out (from gross).
pub fn quote_amm_sell(
    token_in: u64,
    protocol_fee_bps: u64,
    quote_reserves: u64,
    base_reserves: u64,
) -> Option<SellQuote> {
    if token_in == 0 || quote_reserves == 0 || base_reserves == 0 {
        return None;
    }

    let mut gross = (token_in as u128)
        .checked_mul(quote_reserves as u128)?
        .checked_div((base_reserves as u128).checked_add(token_in as u128)?)?;

    if gross > quote_reserves as u128 {
        gross = quote_reserves as u128;
    }
    let gross_lamports = gross as u64;
    if gross_lamports == 0 {
        return None;
    }

    let fee_lamports = fee_from_gross(gross_lamports, protocol_fee_bps)?;
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

/// Bonding spot: virtual ratio.
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

/// AMM spot: real SOL / vault tokens.
pub fn spot_price_amm_lamports_per_token(
    quote_reserves: u64,
    base_reserves: u64,
    token_unit: u64,
) -> u64 {
    if base_reserves == 0 {
        return 0;
    }
    ((quote_reserves as u128).saturating_mul(token_unit as u128) / base_reserves as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    const V_S: u64 = 5_000_000_000;
    const V_T: u64 = 1_073_000_000_000_000;
    const REAL: u64 = 793_100_000_000_000;
    const BPS_FEE: u64 = 125;

    #[test]
    fn buy_caps_at_real_reserves_and_charges_fair_sol() {
        let q = quote_buy(
            1_000_000_000,
            BPS_FEE,
            V_S,
            V_T,
            1_000, // tiny real
        )
        .unwrap();
        assert_eq!(q.token_out, 1_000);
        assert!(q.gross_lamports < 1_000_000_000);
    }

    #[test]
    fn buy_zero_real_fails() {
        assert!(quote_buy(1_000_000_000, BPS_FEE, V_S, V_T, 0).is_none());
    }

    #[test]
    fn flip_continuity_spot() {
        let net = (V_S as u128)
            .checked_mul(REAL as u128)
            .unwrap()
            .checked_div((V_T - REAL) as u128)
            .unwrap() as u64;
        let v_s_end = V_S + net;
        let v_t_end = V_T - REAL;
        let real_sol = net;
        let vault_left = 1_000_000_000_000_000 - REAL;
        let spot_v = spot_price_lamports_per_token(v_s_end, v_t_end, 1_000_000_000);
        let spot_a = spot_price_amm_lamports_per_token(real_sol, vault_left, 1_000_000_000);
        let diff = if spot_v > spot_a {
            spot_v - spot_a
        } else {
            spot_a - spot_v
        };
        assert!(diff * 1_000_000 / spot_v < 1); // sub-ppm
    }

    #[test]
    fn amm_buy_increases_price() {
        let quote = 14_000_000_000u64;
        let base = 206_900_000_000_000u64;
        let q1 = quote_amm_buy(100_000_000, BPS_FEE, quote, base).unwrap();
        let q2 = quote_amm_buy(
            100_000_000,
            BPS_FEE,
            quote + q1.net_lamports,
            base - q1.token_out,
        )
        .unwrap();
        assert!(q2.token_out < q1.token_out);
    }
}
