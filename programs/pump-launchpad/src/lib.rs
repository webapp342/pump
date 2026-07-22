#![no_std]

//! Pump launchpad — Pinocchio (low rent + low CU).
//! Program ID: `Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus`
//!
//! Bonding-curve math: pump.fun virtual+real reserves; **complete=1 → AMM** on real reserves.
//! Fee / treasury / claim / emergency: **Base BondingCurveManager parity**
//!   — all SOL liquidity in one `liquidity` PDA (`address(this)` analogue)
//!   — creator/referrer fees accrue in pending PDAs (claim required)
//!   — protocol fee paid immediately to `protocol_treasury` PDA
//!   — `emergency_sweep` drains liquidity vault + halts trading
//!
//! Instructions (1-byte tag):
//!   0 initialize | 1 create_meme | 2 buy | 3 sell
//!   4 withdraw_protocol_treasury | 5 set_referrer
//!   6 claim_creator_fees | 7 claim_referrer_fees | 8 emergency_sweep
//!   9 emergency_claim_pending_fees (authority sweeps creator/referrer pending)
//!  10 set_emergency_halt (authority clear/set Global.emergency_halt)

pub mod events;
pub mod math;

const TOKEN_UNIT_9: u64 = 1_000_000_000;
const REFERRER_SEED: &[u8] = b"referrer";
const CREATOR_FEES_SEED: &[u8] = b"creator-fees";
const REFERRER_FEES_SEED: &[u8] = b"referrer-fees";
const PROTOCOL_TREASURY_SEED: &[u8] = b"protocol-treasury";

use bytemuck::{Pod, Zeroable};
use pinocchio::{
    account_info::AccountInfo,
    entrypoint,
    instruction::{Seed, Signer},
    program_error::ProgramError,
    pubkey::{find_program_address, Pubkey},
    ProgramResult,
};
use pinocchio_log::log;
use pinocchio_system::instructions::{CreateAccount, Transfer as SolTransfer};
use pinocchio_token::instructions::{
    AuthorityType, MintTo, SetAuthority, Transfer as TokenTransfer,
};

entrypoint!(process_instruction);

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

pub const BPS: u64 = 10_000;
pub const GLOBAL_SEED: &[u8] = b"global";
pub const CURVE_SEED: &[u8] = b"curve";
/// Shared SOL liquidity vault — Base BondingCurveManager balance analogue.
pub const VAULT_SEED: &[u8] = b"vault";
pub const FACTORY_SIGNER_SEED: &[u8] = b"factory-signer";

const IX_INITIALIZE: u8 = 0;
const IX_CREATE_MEME: u8 = 1;
const IX_BUY: u8 = 2;
const IX_SELL: u8 = 3;
const IX_WITHDRAW: u8 = 4;
const IX_SET_REFERRER: u8 = 5;
const IX_CLAIM_CREATOR: u8 = 6;
const IX_CLAIM_REFERRER: u8 = 7;
const IX_EMERGENCY_SWEEP: u8 = 8;
const IX_EMERGENCY_CLAIM_PENDING: u8 = 9;
const IX_SET_EMERGENCY_HALT: u8 = 10;

const LIQUIDITY_RENT_LAMPORTS: u64 = 890_880;
const PROTOCOL_TREASURY_RENT_LAMPORTS: u64 = 890_880;
const GLOBAL_RENT_LAMPORTS: u64 = 2_600_000;
const CURVE_RENT_LAMPORTS: u64 = 1_948_800;
// 48-byte PendingFees rent minimum is 1_224_960 lamports on Solana.
// Keep a small buffer so newly created fee PDAs are always rent-exempt.
const PENDING_FEES_RENT_LAMPORTS: u64 = 1_300_000;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct GlobalConfig {
    pub authority: [u8; 32],
    /// Shared SOL vault (curve reserves + pending claimable fees).
    pub liquidity: [u8; 32],
    /// Protocol fee sink (Base LaunchpadTreasury analogue).
    pub protocol_treasury: [u8; 32],
    pub factory_signer: [u8; 32],
    pub protocol_fee_bps: u64,
    pub creator_fee_share_bps: u64,
    pub referrer_share_bps: u64,
    pub verified_referrer_share_bps: u64,
    pub create_fee_lamports: u64,
    pub initial_virtual_sol_reserves: u64,
    pub initial_virtual_token_reserves: u64,
    pub initial_real_token_reserves: u64,
    pub token_total_supply: u64,
    pub token_decimals: u8,
    pub emergency_halt: u8,
    pub bump: u8,
    pub signer_bump: u8,
    pub liquidity_bump: u8,
    pub protocol_treasury_bump: u8,
    pub _pad: [u8; 2],
}

impl GlobalConfig {
    pub const LEN: usize = core::mem::size_of::<Self>();
}

/// Curve accounting only — SOL does not sit on this account.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Curve {
    pub mint: [u8; 32],
    pub creator: [u8; 32],
    pub token_vault: [u8; 32],
    pub virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub token_total_supply: u64,
    pub initial_real_token_reserves: u64,
    pub complete: u8,
    pub paused: u8,
    pub bump: u8,
    pub _pad: [u8; 5],
}

impl Curve {
    pub const LEN: usize = core::mem::size_of::<Self>();
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct ReferrerBinding {
    pub trader: [u8; 32],
    pub referrer: [u8; 32],
    pub bump: u8,
    pub _pad: [u8; 7],
}

impl ReferrerBinding {
    pub const LEN: usize = core::mem::size_of::<Self>();
}

/// Base pendingCreatorFees / pendingReferrerFees analogue.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct PendingFees {
    pub owner: [u8; 32],
    pub pending_lamports: u64,
    pub bump: u8,
    pub _pad: [u8; 7],
}

impl PendingFees {
    pub const LEN: usize = core::mem::size_of::<Self>();
}

fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let (tag, rest) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;
    match *tag {
        IX_INITIALIZE => process_initialize(program_id, accounts, rest),
        IX_CREATE_MEME => process_create_meme(program_id, accounts, rest),
        IX_BUY => process_buy(program_id, accounts, rest),
        IX_SELL => process_sell(program_id, accounts, rest),
        IX_WITHDRAW => process_withdraw_protocol(program_id, accounts, rest),
        IX_SET_REFERRER => process_set_referrer(program_id, accounts, rest),
        IX_CLAIM_CREATOR => process_claim_fees(program_id, accounts, true),
        IX_CLAIM_REFERRER => process_claim_fees(program_id, accounts, false),
        IX_EMERGENCY_SWEEP => process_emergency_sweep(program_id, accounts),
        IX_EMERGENCY_CLAIM_PENDING => process_emergency_claim_pending(program_id, accounts),
        IX_SET_EMERGENCY_HALT => process_set_emergency_halt(program_id, accounts, rest),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn owner_eq(ai: &AccountInfo, program_id: &Pubkey) -> bool {
    unsafe { ai.owner() == program_id }
}

fn pubkey_bytes(ai: &AccountInfo) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(ai.key().as_ref());
    out
}

fn keys_eq(a: &[u8; 32], b: &Pubkey) -> bool {
    a.as_ref() == b.as_ref()
}

fn read_u64(data: &[u8], off: usize) -> Result<u64, ProgramError> {
    let bytes: [u8; 8] = data
        .get(off..off + 8)
        .ok_or(ProgramError::InvalidInstructionData)?
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    Ok(u64::from_le_bytes(bytes))
}

fn read_u8(data: &[u8], off: usize) -> Result<u8, ProgramError> {
    data.get(off).copied().ok_or(ProgramError::InvalidInstructionData)
}

fn read_borsh_str<'a>(data: &'a [u8], off: &mut usize) -> Result<&'a [u8], ProgramError> {
    if data.len() < *off + 4 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let len = u32::from_le_bytes(
        data[*off..*off + 4]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ) as usize;
    *off += 4;
    if data.len() < *off + len {
        return Err(ProgramError::InvalidInstructionData);
    }
    let s = &data[*off..*off + len];
    *off += len;
    Ok(s)
}

fn parse_create_meme_metadata(data: &[u8]) -> Result<(&[u8], &[u8], &[u8]), ProgramError> {
    let mut off = 0;
    let name = read_borsh_str(data, &mut off)?;
    if name.is_empty() || name.len() > 64 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let symbol = read_borsh_str(data, &mut off)?;
    if symbol.is_empty() || symbol.len() > 16 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let uri = read_borsh_str(data, &mut off)?;
    if uri.len() > 256 {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok((name, symbol, uri))
}

fn write_pod<T: Pod>(ai: &AccountInfo, val: &T) -> ProgramResult {
    let dst = unsafe { ai.borrow_mut_data_unchecked() };
    let bytes = bytemuck::bytes_of(val);
    if dst.len() < bytes.len() {
        return Err(ProgramError::AccountDataTooSmall);
    }
    dst[..bytes.len()].copy_from_slice(bytes);
    Ok(())
}

fn load_pod<T: Pod + Copy>(ai: &AccountInfo) -> Result<T, ProgramError> {
    let data = unsafe { ai.borrow_data_unchecked() };
    let slice = data
        .get(..core::mem::size_of::<T>())
        .ok_or(ProgramError::AccountDataTooSmall)?;
    let val: &T = bytemuck::try_from_bytes(slice).map_err(|_| ProgramError::InvalidAccountData)?;
    Ok(*val)
}

fn process_initialize(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let [authority, liquidity, protocol_treasury, factory_signer, global, system_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (global_pda, bump) = find_program_address(&[GLOBAL_SEED], program_id);
    if global.key() != &global_pda {
        return Err(ProgramError::InvalidSeeds);
    }
    if global.lamports() > 0 {
        if !owner_eq(global, program_id) {
            return Err(ProgramError::IncorrectProgramId);
        }
        let existing_authority_matches = {
            let existing = unsafe { global.borrow_data_unchecked() };
            existing
                .get(..32)
                .map(|stored| stored == authority.key().as_ref())
                .unwrap_or(false)
        };
        if !existing_authority_matches {
            return Err(ProgramError::IllegalOwner);
        }
    }

    let (signer_pda, signer_bump) = find_program_address(&[FACTORY_SIGNER_SEED], program_id);
    if factory_signer.key() != &signer_pda {
        return Err(ProgramError::InvalidSeeds);
    }
    let (liquidity_pda, liquidity_bump) = find_program_address(&[VAULT_SEED], program_id);
    if liquidity.key() != &liquidity_pda {
        return Err(ProgramError::InvalidSeeds);
    }
    let (protocol_pda, protocol_bump) =
        find_program_address(&[PROTOCOL_TREASURY_SEED], program_id);
    if protocol_treasury.key() != &protocol_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    if liquidity.lamports() == 0 {
        let bump_seed = [liquidity_bump];
        let seeds = [Seed::from(VAULT_SEED), Seed::from(bump_seed.as_ref())];
        let signers = [Signer::from(&seeds)];
        CreateAccount {
            from: authority,
            to: liquidity,
            lamports: LIQUIDITY_RENT_LAMPORTS,
            space: 0,
            owner: program_id,
        }
        .invoke_signed(&signers)?;
    } else if !owner_eq(liquidity, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }

    if protocol_treasury.lamports() == 0 {
        let bump_seed = [protocol_bump];
        let seeds = [
            Seed::from(PROTOCOL_TREASURY_SEED),
            Seed::from(bump_seed.as_ref()),
        ];
        let signers = [Signer::from(&seeds)];
        CreateAccount {
            from: authority,
            to: protocol_treasury,
            lamports: PROTOCOL_TREASURY_RENT_LAMPORTS,
            space: 0,
            owner: program_id,
        }
        .invoke_signed(&signers)?;
    } else if !owner_eq(protocol_treasury, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }

    let protocol_fee_bps = read_u64(data, 0)?;
    let creator_fee_share_bps = read_u64(data, 8)?;
    let referrer_share_bps = read_u64(data, 16)?;
    let verified_referrer_share_bps = read_u64(data, 24)?;
    let create_fee_lamports = read_u64(data, 32)?;
    let initial_virtual_sol_reserves = read_u64(data, 40)?;
    let initial_virtual_token_reserves = read_u64(data, 48)?;
    let initial_real_token_reserves = read_u64(data, 56)?;
    let token_total_supply = read_u64(data, 64)?;
    let token_decimals = read_u8(data, 72)?;

    if protocol_fee_bps > BPS
        || creator_fee_share_bps > BPS
        || referrer_share_bps > BPS
        || verified_referrer_share_bps > BPS
    {
        return Err(ProgramError::InvalidArgument);
    }
    if token_total_supply == 0
        || initial_virtual_sol_reserves == 0
        || initial_virtual_token_reserves == 0
        || initial_real_token_reserves == 0
        || initial_real_token_reserves > token_total_supply
        || initial_real_token_reserves > initial_virtual_token_reserves
        || token_decimals > 9
    {
        return Err(ProgramError::InvalidArgument);
    }

    if global.lamports() == 0 {
        let bump_seed = [bump];
        let seeds = [Seed::from(GLOBAL_SEED), Seed::from(bump_seed.as_ref())];
        let signers = [Signer::from(&seeds)];
        CreateAccount {
            from: authority,
            to: global,
            lamports: GLOBAL_RENT_LAMPORTS,
            space: GlobalConfig::LEN as u64,
            owner: program_id,
        }
        .invoke_signed(&signers)?;
        let _ = system_program;
    } else if !owner_eq(global, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    } else if global.data_len() < GlobalConfig::LEN {
        let needed = GLOBAL_RENT_LAMPORTS;
        let have = global.lamports();
        if have < needed {
            SolTransfer {
                from: authority,
                to: global,
                lamports: needed - have,
            }
            .invoke()?;
        }
        global.realloc(GlobalConfig::LEN, true)?;
        let _ = system_program;
    }

    let cfg = GlobalConfig {
        authority: pubkey_bytes(authority),
        liquidity: pubkey_bytes(liquidity),
        protocol_treasury: pubkey_bytes(protocol_treasury),
        factory_signer: pubkey_bytes(factory_signer),
        protocol_fee_bps,
        creator_fee_share_bps,
        referrer_share_bps,
        verified_referrer_share_bps,
        create_fee_lamports,
        initial_virtual_sol_reserves,
        initial_virtual_token_reserves,
        initial_real_token_reserves,
        token_total_supply,
        token_decimals,
        emergency_halt: 0,
        bump,
        signer_bump,
        liquidity_bump,
        protocol_treasury_bump: protocol_bump,
        _pad: [0; 2],
    };
    write_pod(global, &cfg)?;
    log!("pump:initialize");
    Ok(())
}

/// Token vault ATA must be owned by the shared liquidity PDA (Base: tokens on manager).
fn process_create_meme(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let [creator, mint, curve, vault, factory_signer, global, liquidity, _token, _system] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !creator.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let (name, symbol, uri) = parse_create_meme_metadata(data)?;
    if !owner_eq(global, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }

    let g = load_pod::<GlobalConfig>(global)?;
    if !keys_eq(&g.factory_signer, factory_signer.key())
        || !keys_eq(&g.liquidity, liquidity.key())
    {
        return Err(ProgramError::InvalidAccountData);
    }

    let (curve_pda, curve_bump) =
        find_program_address(&[CURVE_SEED, mint.key().as_ref()], program_id);
    if curve.key() != &curve_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    if curve.lamports() == 0 {
        let bump_seed = [curve_bump];
        let seeds = [
            Seed::from(CURVE_SEED),
            Seed::from(mint.key().as_ref()),
            Seed::from(bump_seed.as_ref()),
        ];
        let signers = [Signer::from(&seeds)];
        CreateAccount {
            from: creator,
            to: curve,
            lamports: CURVE_RENT_LAMPORTS,
            space: Curve::LEN as u64,
            owner: program_id,
        }
        .invoke_signed(&signers)?;
    } else if !owner_eq(curve, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }

    if g.create_fee_lamports > 0 {
        SolTransfer {
            from: creator,
            to: liquidity,
            lamports: g.create_fee_lamports,
        }
        .invoke()?;
    }

    let bump_seed = [g.signer_bump];
    let seeds = [
        Seed::from(FACTORY_SIGNER_SEED),
        Seed::from(bump_seed.as_ref()),
    ];
    let signers = [Signer::from(&seeds)];

    SetAuthority {
        account: mint,
        authority: creator,
        authority_type: AuthorityType::MintTokens,
        new_authority: Some(factory_signer.key()),
    }
    .invoke()?;

    MintTo {
        mint,
        account: vault,
        mint_authority: factory_signer,
        amount: g.token_total_supply,
    }
    .invoke_signed(&signers)?;

    SetAuthority {
        account: mint,
        authority: factory_signer,
        authority_type: AuthorityType::MintTokens,
        new_authority: None,
    }
    .invoke_signed(&signers)?;

    let c = Curve {
        mint: pubkey_bytes(mint),
        creator: pubkey_bytes(creator),
        token_vault: pubkey_bytes(vault),
        virtual_token_reserves: g.initial_virtual_token_reserves,
        virtual_sol_reserves: g.initial_virtual_sol_reserves,
        real_token_reserves: g.initial_real_token_reserves,
        real_sol_reserves: 0,
        token_total_supply: g.token_total_supply,
        initial_real_token_reserves: g.initial_real_token_reserves,
        complete: 0,
        paused: 0,
        bump: curve_bump,
        _pad: [0; 5],
    };
    write_pod(curve, &c)?;
    events::emit_token_created(
        &c.mint,
        &c.creator,
        name,
        symbol,
        uri,
        c.token_total_supply,
        c.virtual_sol_reserves,
        g.token_decimals,
    );
    log!("pump:create_meme");
    Ok(())
}

fn read_spl_token_amount(account: &AccountInfo) -> Result<u64, ProgramError> {
    let data = account.try_borrow_data()?;
    if data.len() < 72 {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut buf = [0u8; 8];
    buf.copy_from_slice(&data[64..72]);
    Ok(u64::from_le_bytes(buf))
}

fn curve_spot_price(c: &Curve, vault_base: u64) -> u64 {
    if c.complete != 0 {
        math::spot_price_amm_lamports_per_token(c.real_sol_reserves, vault_base, TOKEN_UNIT_9)
    } else {
        math::spot_price_lamports_per_token(
            c.virtual_sol_reserves,
            c.virtual_token_reserves,
            TOKEN_UNIT_9,
        )
    }
}

fn curve_sold_tokens(c: &Curve) -> u64 {
    c.initial_real_token_reserves
        .saturating_sub(c.real_token_reserves)
}

fn process_buy(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let [trader, global, curve, liquidity, protocol_treasury, creator_fees, referrer_fees, mint, vault, trader_ata, _token, _system, referrer_binding, referrer_wallet] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !trader.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !owner_eq(global, program_id) || !owner_eq(curve, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }

    let sol_in = read_u64(data, 0)?;
    let min_out = read_u64(data, 8)?;
    let g = load_pod::<GlobalConfig>(global)?;
    if g.emergency_halt != 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    if !keys_eq(&g.liquidity, liquidity.key())
        || !keys_eq(&g.protocol_treasury, protocol_treasury.key())
    {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut c = load_pod::<Curve>(curve)?;
    if c.paused != 0 || !keys_eq(&c.mint, mint.key()) || !keys_eq(&c.token_vault, vault.key()) {
        return Err(ProgramError::InvalidAccountData);
    }

    let vault_base = read_spl_token_amount(vault)?;

    let quote = if c.complete != 0 {
        if vault_base == 0 || c.real_sol_reserves == 0 {
            return Err(ProgramError::InvalidArgument);
        }
        math::quote_amm_buy(
            sol_in,
            g.protocol_fee_bps,
            c.real_sol_reserves,
            vault_base,
        )
        .ok_or(ProgramError::InvalidArgument)?
    } else {
        if c.real_token_reserves == 0 {
            return Err(ProgramError::InvalidArgument);
        }
        math::quote_buy(
            sol_in,
            g.protocol_fee_bps,
            c.virtual_sol_reserves,
            c.virtual_token_reserves,
            c.real_token_reserves,
        )
        .ok_or(ProgramError::InvalidArgument)?
    };

    if quote.token_out < min_out || quote.token_out == 0 {
        return Err(ProgramError::InvalidArgument);
    }

    let gross = quote.gross_lamports;
    if gross > sol_in {
        return Err(ProgramError::InvalidArgument);
    }

    SolTransfer {
        from: trader,
        to: liquidity,
        lamports: gross,
    }
    .invoke()?;

    let bump_seed = [g.liquidity_bump];
    let seeds = [Seed::from(VAULT_SEED), Seed::from(bump_seed.as_ref())];
    let signers = [Signer::from(&seeds)];

    TokenTransfer {
        from: vault,
        to: trader_ata,
        authority: liquidity,
        amount: quote.token_out,
    }
    .invoke_signed(&signers)?;

    if c.complete != 0 {
        c.real_sol_reserves = c
            .real_sol_reserves
            .checked_add(quote.net_lamports)
            .ok_or(ProgramError::InvalidAccountData)?;
    } else {
        c.virtual_sol_reserves = c
            .virtual_sol_reserves
            .checked_add(quote.net_lamports)
            .ok_or(ProgramError::InvalidAccountData)?;
        c.real_sol_reserves = c
            .real_sol_reserves
            .checked_add(quote.net_lamports)
            .ok_or(ProgramError::InvalidAccountData)?;
        c.virtual_token_reserves = c
            .virtual_token_reserves
            .checked_sub(quote.token_out)
            .ok_or(ProgramError::InvalidAccountData)?;
        c.real_token_reserves = c
            .real_token_reserves
            .checked_sub(quote.token_out)
            .ok_or(ProgramError::InvalidAccountData)?;
        if c.real_token_reserves == 0 {
            c.complete = 1;
        }
    }

    write_pod(curve, &c)?;

    let fees = accrue_fees(
        trader,
        liquidity,
        protocol_treasury,
        creator_fees,
        referrer_fees,
        referrer_binding,
        referrer_wallet,
        program_id,
        &g,
        &c,
        quote.fee_lamports,
    )?;
    events::emit_fee_split(&c.mint, &c.creator, fees.0, fees.1, fees.2);
    let vault_base_after = vault_base.saturating_sub(quote.token_out);
    events::emit_trade_event(
        &c.mint,
        &pubkey_bytes(trader),
        true,
        gross,
        quote.token_out,
        quote.fee_lamports,
        c.real_sol_reserves,
        curve_sold_tokens(&c),
        curve_spot_price(&c, vault_base_after),
    );
    log!("pump:buy");
    Ok(())
}

fn process_sell(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let [trader, global, curve, liquidity, protocol_treasury, creator_fees, referrer_fees, mint, vault, trader_ata, _token, _system, referrer_binding, referrer_wallet] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !trader.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !owner_eq(global, program_id) || !owner_eq(curve, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }

    let token_in = read_u64(data, 0)?;
    let min_sol = read_u64(data, 8)?;
    let g = load_pod::<GlobalConfig>(global)?;
    if g.emergency_halt != 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    if !keys_eq(&g.liquidity, liquidity.key())
        || !keys_eq(&g.protocol_treasury, protocol_treasury.key())
    {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut c = load_pod::<Curve>(curve)?;
    if c.paused != 0 || !keys_eq(&c.mint, mint.key()) || !keys_eq(&c.token_vault, vault.key()) {
        return Err(ProgramError::InvalidAccountData);
    }

    let vault_base = read_spl_token_amount(vault)?;

    let quote = if c.complete != 0 {
        if vault_base == 0 || c.real_sol_reserves == 0 {
            return Err(ProgramError::InvalidArgument);
        }
        math::quote_amm_sell(
            token_in,
            g.protocol_fee_bps,
            c.real_sol_reserves,
            vault_base,
        )
        .ok_or(ProgramError::InvalidArgument)?
    } else {
        math::quote_sell(
            token_in,
            g.protocol_fee_bps,
            c.virtual_sol_reserves,
            c.virtual_token_reserves,
            c.real_sol_reserves,
        )
        .ok_or(ProgramError::InvalidArgument)?
    };

    if quote.lamports_out < min_sol || quote.lamports_out == 0 {
        return Err(ProgramError::InvalidArgument);
    }

    TokenTransfer {
        from: trader_ata,
        to: vault,
        authority: trader,
        amount: token_in,
    }
    .invoke()?;

    if c.complete != 0 {
        c.real_sol_reserves = c
            .real_sol_reserves
            .checked_sub(quote.gross_lamports)
            .ok_or(ProgramError::InvalidAccountData)?;
    } else {
        c.virtual_sol_reserves = c
            .virtual_sol_reserves
            .checked_sub(quote.gross_lamports)
            .ok_or(ProgramError::InvalidAccountData)?;
        c.real_sol_reserves = c
            .real_sol_reserves
            .checked_sub(quote.gross_lamports)
            .ok_or(ProgramError::InvalidAccountData)?;
        c.virtual_token_reserves = c
            .virtual_token_reserves
            .checked_add(token_in)
            .ok_or(ProgramError::InvalidAccountData)?;
        c.real_token_reserves = c
            .real_token_reserves
            .checked_add(token_in)
            .ok_or(ProgramError::InvalidAccountData)?;
        if c.real_token_reserves > c.initial_real_token_reserves {
            c.real_token_reserves = c.initial_real_token_reserves;
        }
    }

    write_pod(curve, &c)?;

    let bump_seed = [g.liquidity_bump];
    let seeds = [Seed::from(VAULT_SEED), Seed::from(bump_seed.as_ref())];
    let signers = [Signer::from(&seeds)];
    *liquidity.try_borrow_mut_lamports()? -= quote.lamports_out;
    *trader.try_borrow_mut_lamports()? += quote.lamports_out;
    let _ = signers;

    let fees = accrue_fees(
        trader,
        liquidity,
        protocol_treasury,
        creator_fees,
        referrer_fees,
        referrer_binding,
        referrer_wallet,
        program_id,
        &g,
        &c,
        quote.fee_lamports,
    )?;
    events::emit_fee_split(&c.mint, &c.creator, fees.0, fees.1, fees.2);
    let vault_base_after = vault_base.saturating_add(token_in);
    events::emit_trade_event(
        &c.mint,
        &pubkey_bytes(trader),
        false,
        quote.gross_lamports,
        token_in,
        quote.fee_lamports,
        c.real_sol_reserves,
        curve_sold_tokens(&c),
        curve_spot_price(&c, vault_base_after),
    );
    log!("pump:sell");
    Ok(())
}

fn load_referrer_binding(
    ai: &AccountInfo,
    program_id: &Pubkey,
    trader: &AccountInfo,
) -> Option<ReferrerBinding> {
    if !owner_eq(ai, program_id) || ai.data_len() < ReferrerBinding::LEN {
        return None;
    }
    let (pda, _bump) =
        find_program_address(&[REFERRER_SEED, trader.key().as_ref()], program_id);
    if ai.key() != &pda {
        return None;
    }
    load_pod::<ReferrerBinding>(ai).ok()
}

fn ensure_pending_fees(
    payer: &AccountInfo,
    account: &AccountInfo,
    program_id: &Pubkey,
    seed: &[u8],
    owner: &[u8; 32],
) -> Result<u8, ProgramError> {
    let (pda, bump) = find_program_address(&[seed, owner.as_ref()], program_id);
    if account.key() != &pda {
        return Err(ProgramError::InvalidSeeds);
    }
    if account.lamports() == 0 {
        let bump_seed = [bump];
        let seeds = [
            Seed::from(seed),
            Seed::from(owner.as_ref()),
            Seed::from(bump_seed.as_ref()),
        ];
        let signers = [Signer::from(&seeds)];
        CreateAccount {
            from: payer,
            to: account,
            lamports: PENDING_FEES_RENT_LAMPORTS,
            space: PendingFees::LEN as u64,
            owner: program_id,
        }
        .invoke_signed(&signers)?;
        let init = PendingFees {
            owner: *owner,
            pending_lamports: 0,
            bump,
            _pad: [0; 7],
        };
        write_pod(account, &init)?;
    } else if !owner_eq(account, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(bump)
}

/// Base `_distributeFee`: pending creator/referrer + immediate protocol treasury.
fn accrue_fees(
    payer: &AccountInfo,
    liquidity: &AccountInfo,
    protocol_treasury: &AccountInfo,
    creator_fees: &AccountInfo,
    referrer_fees: &AccountInfo,
    referrer_binding: &AccountInfo,
    referrer_wallet: &AccountInfo,
    program_id: &Pubkey,
    g: &GlobalConfig,
    c: &Curve,
    fee: u64,
) -> Result<(u64, u64, u64), ProgramError> {
    if fee == 0 {
        return Ok((0, 0, 0));
    }

    let creator_fee = (fee as u128)
        .checked_mul(g.creator_fee_share_bps as u128)
        .ok_or(ProgramError::InvalidAccountData)?
        .checked_div(BPS as u128)
        .ok_or(ProgramError::InvalidAccountData)? as u64;

    let mut referrer_fee = 0u64;
    let mut referrer_key = [0u8; 32];
    if let Some(binding) = load_referrer_binding(referrer_binding, program_id, payer) {
        let zero = [0u8; 32];
        if binding.referrer != zero && keys_eq(&binding.referrer, referrer_wallet.key()) {
            referrer_fee = (fee as u128)
                .checked_mul(g.referrer_share_bps as u128)
                .ok_or(ProgramError::InvalidAccountData)?
                .checked_div(BPS as u128)
                .ok_or(ProgramError::InvalidAccountData)? as u64;
            referrer_key = binding.referrer;
        }
    }

    let treasury_fee = fee
        .checked_sub(creator_fee)
        .ok_or(ProgramError::InvalidAccountData)?
        .checked_sub(referrer_fee)
        .ok_or(ProgramError::InvalidAccountData)?;

    if creator_fee > 0 {
        ensure_pending_fees(payer, creator_fees, program_id, CREATOR_FEES_SEED, &c.creator)?;
        let mut pending = load_pod::<PendingFees>(creator_fees)?;
        if pending.owner != c.creator {
            return Err(ProgramError::InvalidAccountData);
        }
        pending.pending_lamports = pending
            .pending_lamports
            .checked_add(creator_fee)
            .ok_or(ProgramError::InvalidAccountData)?;
        write_pod(creator_fees, &pending)?;
    }

    if referrer_fee > 0 {
        ensure_pending_fees(payer, referrer_fees, program_id, REFERRER_FEES_SEED, &referrer_key)?;
        let mut pending = load_pod::<PendingFees>(referrer_fees)?;
        if pending.owner != referrer_key {
            return Err(ProgramError::InvalidAccountData);
        }
        pending.pending_lamports = pending
            .pending_lamports
            .checked_add(referrer_fee)
            .ok_or(ProgramError::InvalidAccountData)?;
        write_pod(referrer_fees, &pending)?;
    }

    // Protocol share leaves liquidity immediately (Base → LaunchpadTreasury).
    if treasury_fee > 0 {
        *liquidity.try_borrow_mut_lamports()? -= treasury_fee;
        *protocol_treasury.try_borrow_mut_lamports()? += treasury_fee;
    }

    Ok((creator_fee, referrer_fee, treasury_fee))
}

fn process_claim_fees(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    is_creator: bool,
) -> ProgramResult {
    let [claimer, global, liquidity, pending_fees] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !claimer.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !owner_eq(global, program_id) || !owner_eq(pending_fees, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let g = load_pod::<GlobalConfig>(global)?;
    if !keys_eq(&g.liquidity, liquidity.key()) {
        return Err(ProgramError::InvalidAccountData);
    }

    let seed = if is_creator {
        CREATOR_FEES_SEED
    } else {
        REFERRER_FEES_SEED
    };
    let (pda, _bump) = find_program_address(&[seed, claimer.key().as_ref()], program_id);
    if pending_fees.key() != &pda {
        return Err(ProgramError::InvalidSeeds);
    }

    let mut pending = load_pod::<PendingFees>(pending_fees)?;
    if !keys_eq(&pending.owner, claimer.key()) {
        return Err(ProgramError::InvalidAccountData);
    }
    let amount = pending.pending_lamports;
    if amount == 0 {
        return Err(ProgramError::Custom(1));
    }
    // Keep rent-exempt floor on liquidity vault.
    if liquidity.lamports() < amount.saturating_add(LIQUIDITY_RENT_LAMPORTS) {
        return Err(ProgramError::InsufficientFunds);
    }

    pending.pending_lamports = 0;
    write_pod(pending_fees, &pending)?;

    *liquidity.try_borrow_mut_lamports()? -= amount;
    *claimer.try_borrow_mut_lamports()? += amount;

    if is_creator {
        events::emit_creator_fee_claimed(&pubkey_bytes(claimer), amount);
    } else {
        events::emit_referrer_fee_claimed(&pubkey_bytes(claimer), amount);
    }
    log!("pump:claim_fees");
    Ok(())
}

fn process_set_referrer(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _data: &[u8],
) -> ProgramResult {
    let [trader, referrer, binding, system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !trader.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if trader.key() == referrer.key() {
        return Err(ProgramError::InvalidArgument);
    }

    let (binding_pda, bump) =
        find_program_address(&[REFERRER_SEED, trader.key().as_ref()], program_id);
    if binding.key() != &binding_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    if binding.lamports() == 0 {
        let bump_seed = [bump];
        let seeds = [
            Seed::from(REFERRER_SEED),
            Seed::from(trader.key().as_ref()),
            Seed::from(bump_seed.as_ref()),
        ];
        let signers = [Signer::from(&seeds)];
        CreateAccount {
            from: trader,
            to: binding,
            lamports: 1_500_000,
            space: ReferrerBinding::LEN as u64,
            owner: program_id,
        }
        .invoke_signed(&signers)?;
        let _ = system_program;
    } else if !owner_eq(binding, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    } else {
        let existing = load_pod::<ReferrerBinding>(binding)?;
        let zero = [0u8; 32];
        if existing.referrer != zero {
            return Err(ProgramError::Custom(2));
        }
    }

    let rb = ReferrerBinding {
        trader: pubkey_bytes(trader),
        referrer: pubkey_bytes(referrer),
        bump,
        _pad: [0; 7],
    };
    write_pod(binding, &rb)?;
    events::emit_referrer_set(&rb.trader, &rb.referrer);
    log!("pump:set_referrer");
    Ok(())
}

/// Authority withdraws protocol fees from protocol_treasury PDA.
fn process_withdraw_protocol(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let [authority, global, protocol_treasury, to] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !owner_eq(global, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let g = load_pod::<GlobalConfig>(global)?;
    if !keys_eq(&g.authority, authority.key())
        || !keys_eq(&g.protocol_treasury, protocol_treasury.key())
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let amount = read_u64(data, 0)?;
    if amount == 0
        || protocol_treasury.lamports() < amount.saturating_add(PROTOCOL_TREASURY_RENT_LAMPORTS)
    {
        return Err(ProgramError::Custom(1));
    }
    *protocol_treasury.try_borrow_mut_lamports()? -= amount;
    *to.try_borrow_mut_lamports()? += amount;
    log!("pump:withdraw_protocol");
    Ok(())
}

/// Base `emergencySweepAllEth` — drain shared liquidity vault and halt trading.
fn process_emergency_sweep(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let [authority, global, liquidity, to] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !owner_eq(global, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let mut g = load_pod::<GlobalConfig>(global)?;
    if !keys_eq(&g.authority, authority.key()) || !keys_eq(&g.liquidity, liquidity.key()) {
        return Err(ProgramError::InvalidAccountData);
    }

    let bal = liquidity.lamports();
    if bal <= LIQUIDITY_RENT_LAMPORTS {
        return Err(ProgramError::Custom(1));
    }
    let amount = bal - LIQUIDITY_RENT_LAMPORTS;

    g.emergency_halt = 1;
    write_pod(global, &g)?;

    *liquidity.try_borrow_mut_lamports()? -= amount;
    *to.try_borrow_mut_lamports()? += amount;

    events::emit_emergency_swept(&pubkey_bytes(to), amount);
    log!("pump:emergency_sweep");
    Ok(())
}

/// Authority sweeps unclaimed creator/referrer pending fees from liquidity → `to`.
/// PendingFees PDA is accounting only; SOL moves out of the shared liquidity vault.
fn process_emergency_claim_pending(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let [authority, global, liquidity, pending_fees, to] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !owner_eq(global, program_id) || !owner_eq(pending_fees, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let g = load_pod::<GlobalConfig>(global)?;
    if !keys_eq(&g.authority, authority.key()) || !keys_eq(&g.liquidity, liquidity.key()) {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut pending = load_pod::<PendingFees>(pending_fees)?;
    let (creator_pda, _) =
        find_program_address(&[CREATOR_FEES_SEED, pending.owner.as_ref()], program_id);
    let (referrer_pda, _) =
        find_program_address(&[REFERRER_FEES_SEED, pending.owner.as_ref()], program_id);
    let is_creator = pending_fees.key() == &creator_pda;
    let is_referrer = pending_fees.key() == &referrer_pda;
    if !is_creator && !is_referrer {
        return Err(ProgramError::InvalidSeeds);
    }

    let amount = pending.pending_lamports;
    if amount == 0 {
        return Err(ProgramError::Custom(1));
    }
    if liquidity.lamports() < amount.saturating_add(LIQUIDITY_RENT_LAMPORTS) {
        return Err(ProgramError::InsufficientFunds);
    }

    pending.pending_lamports = 0;
    write_pod(pending_fees, &pending)?;

    *liquidity.try_borrow_mut_lamports()? -= amount;
    *to.try_borrow_mut_lamports()? += amount;

    events::emit_emergency_pending_claimed(&pending.owner, &pubkey_bytes(to), amount, is_creator);
    log!("pump:emergency_claim_pending");
    Ok(())
}

/// Authority sets or clears Global.emergency_halt (Base setEmergencyHalt parity).
fn process_set_emergency_halt(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let [authority, global] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !owner_eq(global, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let halt = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    if halt > 1 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let mut g = load_pod::<GlobalConfig>(global)?;
    if !keys_eq(&g.authority, authority.key()) {
        return Err(ProgramError::InvalidAccountData);
    }
    g.emergency_halt = halt;
    write_pod(global, &g)?;
    log!("pump:set_emergency_halt");
    Ok(())
}
