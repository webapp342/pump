#![no_std]

//! Pump launchpad — Pinocchio (low rent + low CU).
//! Program ID: `Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus`
//!
//! Bonding-curve state/math: pump.fun parity (virtual + real reserves).
//! Differences vs pump.fun: our protocol/creator/referral fee split; **no graduation/migrate**.
//!
//! Instructions (1-byte tag):
//!   0 initialize | 1 create_meme | 2 buy | 3 sell | 4 withdraw_treasury | 5 set_referrer
//!
//! @see https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md

pub mod events;
pub mod math;

const TOKEN_UNIT_9: u64 = 1_000_000_000;
const REFERRER_SEED: &[u8] = b"referrer";

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
/// PDA seed for bonding curve — kept as `curve` for our program ID continuity.
pub const CURVE_SEED: &[u8] = b"curve";
pub const VAULT_SEED: &[u8] = b"vault";
pub const FACTORY_SIGNER_SEED: &[u8] = b"factory-signer";

const IX_INITIALIZE: u8 = 0;
const IX_CREATE_MEME: u8 = 1;
const IX_BUY: u8 = 2;
const IX_SELL: u8 = 3;
const IX_WITHDRAW: u8 = 4;
const IX_SET_REFERRER: u8 = 5;

/// Rent-exempt minimums (devnet/mainnet 2026 — match `getMinimumBalanceForRentExemption`).
const TREASURY_RENT_LAMPORTS: u64 = 890_880;
const GLOBAL_RENT_LAMPORTS: u64 = 2_200_000;
const CURVE_RENT_LAMPORTS: u64 = 1_948_800;

/// Global config — pump.fun reserve fields + our fee shares.
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct GlobalConfig {
    pub authority: [u8; 32],
    pub treasury: [u8; 32],
    pub factory_signer: [u8; 32],
    pub protocol_fee_bps: u64,
    pub creator_fee_share_bps: u64,
    pub referrer_share_bps: u64,
    pub verified_referrer_share_bps: u64,
    pub create_fee_lamports: u64,
    /// pump.fun `initial_virtual_sol_reserves` (30 SOL).
    pub initial_virtual_sol_reserves: u64,
    /// pump.fun `initial_virtual_token_reserves` (1.073B raw @ 6dp).
    pub initial_virtual_token_reserves: u64,
    /// pump.fun `initial_real_token_reserves` (793.1M raw) — sellable on curve.
    pub initial_real_token_reserves: u64,
    /// pump.fun `token_total_supply` (1B raw) — minted into vault.
    pub token_total_supply: u64,
    pub token_decimals: u8,
    pub emergency_halt: u8,
    pub bump: u8,
    pub signer_bump: u8,
    pub vault_bump: u8,
    pub _pad: [u8; 3],
}

impl GlobalConfig {
    pub const LEN: usize = core::mem::size_of::<Self>();
}

/// Bonding curve — pump.fun layout (+ vault pubkey for SPL transfers).
/// `complete` is never set true (no graduation).
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
    /// Always 0 — graduation disabled.
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
        IX_WITHDRAW => process_withdraw(program_id, accounts, rest),
        IX_SET_REFERRER => process_set_referrer(program_id, accounts, rest),
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

/// Data: 9×u64 fees/reserves + u8 decimals (73 bytes).
/// Creates `global` PDA via system CPI if not yet allocated.
fn process_initialize(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let [authority, treasury, factory_signer, global, system_program] = accounts else {
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
        // Re-initialize is an admin update, not a public takeover path.
        // The authority is the first 32 bytes in both old and new layouts.
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
    let (vault_pda, vault_bump) = find_program_address(&[VAULT_SEED], program_id);
    if treasury.key() != &vault_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    // Treasury must exist as a rent-exempt, program-owned PDA before receiving
    // small protocol fees. Crediting an absent account with less than the
    // rent-exempt minimum makes the runtime reject the entire trade.
    if treasury.lamports() == 0 {
        let bump_seed = [vault_bump];
        let seeds = [Seed::from(VAULT_SEED), Seed::from(bump_seed.as_ref())];
        let signers = [Signer::from(&seeds)];
        CreateAccount {
            from: authority,
            to: treasury,
            lamports: TREASURY_RENT_LAMPORTS,
            space: 0,
            owner: program_id,
        }
        .invoke_signed(&signers)?;
    } else if !owner_eq(treasury, program_id) {
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
    // pump.fun: virtual_token >= real_token, real_token <= total_supply, all non-zero
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

    // Allocate global PDA on first init, or grow if layout was upgraded.
    if global.lamports() == 0 {
        let space = GlobalConfig::LEN as u64;
        let lamports = GLOBAL_RENT_LAMPORTS;
        let bump_seed = [bump];
        let seeds = [Seed::from(GLOBAL_SEED), Seed::from(bump_seed.as_ref())];
        let signers = [Signer::from(&seeds)];
        CreateAccount {
            from: authority,
            to: global,
            lamports,
            space,
            owner: program_id,
        }
        .invoke_signed(&signers)?;
        let _ = system_program;
    } else if !owner_eq(global, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    } else if global.data_len() < GlobalConfig::LEN {
        // Layout upgrade: old Global was smaller — top up rent + realloc.
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
        treasury: pubkey_bytes(treasury),
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
        vault_bump,
        _pad: [0; 3],
    };
    write_pod(global, &cfg)?;
    log!("pump:initialize");
    Ok(())
}

/// Accounts: creator, mint, curve, curve_token_vault, factory_signer, global,
///           treasury_vault, token_program, system
/// Client pre-creates mint (authority=creator), Metaplex metadata, curve PDA, vault ATA.
/// Instruction data: borsh name (≤64), symbol (≤16), uri (≤256).
fn process_create_meme(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let [creator, mint, curve, vault, factory_signer, global, treasury, _token, _system] =
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
        || !keys_eq(&g.treasury, treasury.key())
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
            to: treasury,
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

    // pump.fun BondingCurve init — complete stays false forever (no migrate).
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

fn process_buy(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let [trader, global, curve, treasury, creator, mint, vault, trader_ata, _token, _system, referrer_binding, referrer_wallet] =
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
    if !keys_eq(&g.treasury, treasury.key()) {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut c = load_pod::<Curve>(curve)?;
    if c.paused != 0 || c.complete != 0 || !keys_eq(&c.mint, mint.key()) || !keys_eq(&c.token_vault, vault.key())
    {
        return Err(ProgramError::InvalidAccountData);
    }
    if !keys_eq(&c.creator, creator.key()) {
        return Err(ProgramError::InvalidAccountData);
    }
    if c.real_token_reserves == 0 {
        return Err(ProgramError::InvalidArgument);
    }

    let quote = math::quote_buy(
        sol_in,
        g.protocol_fee_bps,
        c.virtual_sol_reserves,
        c.virtual_token_reserves,
        c.real_token_reserves,
    )
    .ok_or(ProgramError::InvalidArgument)?;
    if quote.token_out < min_out || quote.token_out == 0 {
        return Err(ProgramError::InvalidArgument);
    }

    SolTransfer {
        from: trader,
        to: curve,
        lamports: sol_in,
    }
    .invoke()?;

    let bump_seed = [c.bump];
    let seeds = [
        Seed::from(CURVE_SEED),
        Seed::from(mint.key().as_ref()),
        Seed::from(bump_seed.as_ref()),
    ];
    let signers = [Signer::from(&seeds)];

    TokenTransfer {
        from: vault,
        to: trader_ata,
        authority: curve,
        amount: quote.token_out,
    }
    .invoke_signed(&signers)?;

    // pump.fun: both virtual and real move by the same amounts
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
    // No graduation: never set complete=1 even when real_token_reserves==0

    write_pod(curve, &c)?;

    let fees = split_fees(
        curve,
        creator,
        treasury,
        referrer_binding,
        referrer_wallet,
        program_id,
        trader,
        &g,
        quote.fee_lamports,
        &c,
    )?;
    events::emit_fee_split(
        &c.mint,
        &c.creator,
        fees.0,
        fees.1,
        fees.2,
    );
    let sold = c
        .initial_real_token_reserves
        .saturating_sub(c.real_token_reserves);
    events::emit_trade_event(
        &c.mint,
        &pubkey_bytes(trader),
        true,
        sol_in,
        quote.token_out,
        quote.fee_lamports,
        c.real_sol_reserves,
        sold,
        math::spot_price_lamports_per_token(
            c.virtual_sol_reserves,
            c.virtual_token_reserves,
            TOKEN_UNIT_9,
        ),
    );
    log!("pump:buy");
    Ok(())
}

fn process_sell(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let [trader, global, curve, treasury, creator, mint, vault, trader_ata, _token, _system, referrer_binding, referrer_wallet] =
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
    if !keys_eq(&g.treasury, treasury.key()) {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut c = load_pod::<Curve>(curve)?;
    if c.paused != 0 || !keys_eq(&c.mint, mint.key()) || !keys_eq(&c.token_vault, vault.key()) {
        return Err(ProgramError::InvalidAccountData);
    }
    if !keys_eq(&c.creator, creator.key()) {
        return Err(ProgramError::InvalidAccountData);
    }

    let quote = math::quote_sell(
        token_in,
        g.protocol_fee_bps,
        c.virtual_sol_reserves,
        c.virtual_token_reserves,
        c.real_sol_reserves,
    )
    .ok_or(ProgramError::InvalidArgument)?;
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

    // pump.fun: virtual + real move together on sell
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
    // Cap real tokens at initial (cannot exceed sellable inventory)
    if c.real_token_reserves > c.initial_real_token_reserves {
        c.real_token_reserves = c.initial_real_token_reserves;
    }

    write_pod(curve, &c)?;

    *curve.try_borrow_mut_lamports()? -= quote.lamports_out;
    *trader.try_borrow_mut_lamports()? += quote.lamports_out;

    let fees = split_fees(
        curve,
        creator,
        treasury,
        referrer_binding,
        referrer_wallet,
        program_id,
        trader,
        &g,
        quote.fee_lamports,
        &c,
    )?;
    events::emit_fee_split(
        &c.mint,
        &c.creator,
        fees.0,
        fees.1,
        fees.2,
    );
    let sold = c
        .initial_real_token_reserves
        .saturating_sub(c.real_token_reserves);
    events::emit_trade_event(
        &c.mint,
        &pubkey_bytes(trader),
        false,
        quote.gross_lamports,
        token_in,
        quote.fee_lamports,
        c.real_sol_reserves,
        sold,
        math::spot_price_lamports_per_token(
            c.virtual_sol_reserves,
            c.virtual_token_reserves,
            TOKEN_UNIT_9,
        ),
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
    let (pda, _bump) = find_program_address(
        &[REFERRER_SEED, trader.key().as_ref()],
        program_id,
    );
    if ai.key() != &pda {
        return None;
    }
    load_pod::<ReferrerBinding>(ai).ok()
}

fn split_fees(
    curve: &AccountInfo,
    creator: &AccountInfo,
    treasury: &AccountInfo,
    referrer_binding: &AccountInfo,
    referrer_wallet: &AccountInfo,
    program_id: &Pubkey,
    trader: &AccountInfo,
    g: &GlobalConfig,
    fee: u64,
    c: &Curve,
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
    if let Some(binding) = load_referrer_binding(referrer_binding, program_id, trader) {
        let zero = [0u8; 32];
        if binding.referrer != zero && keys_eq(&binding.referrer, referrer_wallet.key()) {
            referrer_fee = (fee as u128)
                .checked_mul(g.referrer_share_bps as u128)
                .ok_or(ProgramError::InvalidAccountData)?
                .checked_div(BPS as u128)
                .ok_or(ProgramError::InvalidAccountData)? as u64;
        }
    }

    let treasury_fee = fee
        .checked_sub(creator_fee)
        .ok_or(ProgramError::InvalidAccountData)?
        .checked_sub(referrer_fee)
        .ok_or(ProgramError::InvalidAccountData)?;

    // Defense in depth: never pay fees to a mismatched creator account.
    if !keys_eq(&c.creator, creator.key()) {
        return Err(ProgramError::InvalidAccountData);
    }
    if !keys_eq(&g.treasury, treasury.key()) {
        return Err(ProgramError::InvalidAccountData);
    }

    if creator_fee > 0 {
        *curve.try_borrow_mut_lamports()? -= creator_fee;
        *creator.try_borrow_mut_lamports()? += creator_fee;
    }
    if referrer_fee > 0 {
        *curve.try_borrow_mut_lamports()? -= referrer_fee;
        *referrer_wallet.try_borrow_mut_lamports()? += referrer_fee;
    }
    if treasury_fee > 0 {
        *curve.try_borrow_mut_lamports()? -= treasury_fee;
        *treasury.try_borrow_mut_lamports()? += treasury_fee;
    }
    let _ = c;
    Ok((creator_fee, referrer_fee, treasury_fee))
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

fn process_withdraw(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let [authority, global, vault, to] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !owner_eq(global, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let g = load_pod::<GlobalConfig>(global)?;
    if !keys_eq(&g.authority, authority.key()) || !keys_eq(&g.treasury, vault.key()) {
        return Err(ProgramError::InvalidAccountData);
    }
    let amount = read_u64(data, 0)?;
    if amount == 0 || vault.lamports() < amount {
        return Err(ProgramError::Custom(1));
    }
    *vault.try_borrow_mut_lamports()? -= amount;
    *to.try_borrow_mut_lamports()? += amount;
    log!("pump:withdraw");
    Ok(())
}
