#![no_std]

//! Rent/size spike: Pinocchio launchpad core (same math + ix surface as pump-curve).
//! Build: `cargo-build-sbf` in this directory.

pub mod math;

use bytemuck::{Pod, Zeroable};
use pinocchio::{
    account_info::AccountInfo,
    entrypoint,
    program_error::ProgramError,
    pubkey::Pubkey,
    ProgramResult,
};
use pinocchio_log::log;
use pinocchio_system::instructions::Transfer;

entrypoint!(process_instruction);

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

fn owner_eq(ai: &AccountInfo, program_id: &Pubkey) -> bool {
    unsafe { ai.owner() == program_id }
}

/// Instruction tags (1 byte) — spike only; production would use 8-byte Anchor-style discriminators.
const IX_INITIALIZE: u8 = 0;
const IX_CREATE_MEME: u8 = 1;
const IX_BUY: u8 = 2;
const IX_SELL: u8 = 3;
const IX_WITHDRAW_TREASURY: u8 = 4;

pub const BPS: u64 = 10_000;

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
    pub emergency_halt: u8,
    pub bump: u8,
    pub _pad: [u8; 6],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Curve {
    pub mint: [u8; 32],
    pub creator: [u8; 32],
    pub token_vault: [u8; 32],
    pub reserve_sol: u64,
    pub sold_tokens: u64,
    pub virtual_sol_reserve: u64,
    pub virtual_token_reserve: u64,
    pub total_supply: u64,
    pub paused: u8,
    pub bump: u8,
    pub _pad: [u8; 6],
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
        IX_WITHDRAW_TREASURY => process_withdraw(program_id, accounts, rest),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn pubkey_bytes(ai: &AccountInfo) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(ai.key().as_ref());
    out
}

fn read_u64(data: &[u8], off: usize) -> Result<u64, ProgramError> {
    let bytes: [u8; 8] = data
        .get(off..off + 8)
        .ok_or(ProgramError::InvalidInstructionData)?
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    Ok(u64::from_le_bytes(bytes))
}

fn process_initialize(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let [authority, treasury, factory_signer, global, _system] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !owner_eq(global, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let fee_bps = read_u64(data, 0)?;
    let creator_bps = read_u64(data, 8)?;
    let referrer_bps = read_u64(data, 16)?;
    let verified_bps = read_u64(data, 24)?;
    if fee_bps > BPS || creator_bps > BPS || referrer_bps > BPS || verified_bps > BPS {
        return Err(ProgramError::InvalidArgument);
    }

    let mut cfg = GlobalConfig {
        authority: pubkey_bytes(authority),
        treasury: pubkey_bytes(treasury),
        factory_signer: pubkey_bytes(factory_signer),
        protocol_fee_bps: fee_bps,
        creator_fee_share_bps: creator_bps,
        referrer_share_bps: referrer_bps,
        verified_referrer_share_bps: verified_bps,
        emergency_halt: 0,
        bump: 0,
        _pad: [0; 6],
    };
    // bump left 0 in spike; production derives PDA bump
    let dst = unsafe { global.borrow_mut_data_unchecked() };
    if dst.len() < core::mem::size_of::<GlobalConfig>() {
        return Err(ProgramError::AccountDataTooSmall);
    }
    bytemuck::bytes_of_mut(&mut cfg)
        .iter()
        .enumerate()
        .for_each(|(i, b)| dst[i] = *b);
    log!("pump:initialize");
    Ok(())
}

/// Spike: validates accounts + writes curve state (mint/ATA CPI omitted to keep spike focused on size).
fn process_create_meme(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let [creator, mint, curve, vault, global, _token, _ata, _system] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !creator.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !owner_eq(curve, program_id) || !owner_eq(global, program_id) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let v_sol = read_u64(data, 0)?;
    let v_tok = read_u64(data, 8)?;
    let supply = read_u64(data, 16)?;
    if v_sol == 0 || v_tok == 0 || supply == 0 || v_tok != supply {
        return Err(ProgramError::InvalidArgument);
    }
    let mut c = Curve {
        mint: pubkey_bytes(mint),
        creator: pubkey_bytes(creator),
        token_vault: pubkey_bytes(vault),
        reserve_sol: 0,
        sold_tokens: 0,
        virtual_sol_reserve: v_sol,
        virtual_token_reserve: v_tok,
        total_supply: supply,
        paused: 0,
        bump: 0,
        _pad: [0; 6],
    };
    let dst = unsafe { curve.borrow_mut_data_unchecked() };
    if dst.len() < core::mem::size_of::<Curve>() {
        return Err(ProgramError::AccountDataTooSmall);
    }
    bytemuck::bytes_of_mut(&mut c)
        .iter()
        .enumerate()
        .for_each(|(i, b)| dst[i] = *b);
    log!("pump:create_meme");
    Ok(())
}

fn load_global(global: &AccountInfo) -> Result<GlobalConfig, ProgramError> {
    let data = unsafe { global.borrow_data_unchecked() };
    let cfg: &GlobalConfig = bytemuck::try_from_bytes(
        data.get(..core::mem::size_of::<GlobalConfig>())
            .ok_or(ProgramError::AccountDataTooSmall)?,
    )
    .map_err(|_| ProgramError::InvalidAccountData)?;
    Ok(*cfg)
}

fn load_curve(curve: &AccountInfo) -> Result<Curve, ProgramError> {
    let data = unsafe { curve.borrow_data_unchecked() };
    let c: &Curve = bytemuck::try_from_bytes(
        data.get(..core::mem::size_of::<Curve>())
            .ok_or(ProgramError::AccountDataTooSmall)?,
    )
    .map_err(|_| ProgramError::InvalidAccountData)?;
    Ok(*c)
}

fn store_curve(curve: &AccountInfo, mut c: Curve) -> ProgramResult {
    let dst = unsafe { curve.borrow_mut_data_unchecked() };
    bytemuck::bytes_of_mut(&mut c)
        .iter()
        .enumerate()
        .for_each(|(i, b)| dst[i] = *b);
    Ok(())
}

fn process_buy(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let [trader, global, curve, treasury, creator, _mint, _vault, _trader_ata, _token, system] =
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
    let g = load_global(global)?;
    if g.emergency_halt != 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut c = load_curve(curve)?;
    if c.paused != 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    let quote = math::quote_buy(
        sol_in,
        g.protocol_fee_bps,
        c.virtual_sol_reserve,
        c.virtual_token_reserve,
        c.reserve_sol,
        c.sold_tokens,
    )
    .ok_or(ProgramError::InvalidArgument)?;
    if quote.token_out < min_out || quote.token_out == 0 {
        return Err(ProgramError::InvalidArgument);
    }

    Transfer {
        from: trader,
        to: curve,
        lamports: sol_in,
    }
    .invoke()?;

    c.reserve_sol = c
        .reserve_sol
        .checked_add(quote.net_lamports)
        .ok_or(ProgramError::InvalidAccountData)?;
    c.sold_tokens = c
        .sold_tokens
        .checked_add(quote.token_out)
        .ok_or(ProgramError::InvalidAccountData)?;
    store_curve(curve, c)?;

    // Fee split (SOL only in spike; SPL transfer omitted for size baseline of logic+CPI)
    split_fees(curve, creator, treasury, &g, quote.fee_lamports)?;
    let _ = system;
    log!("pump:buy");
    Ok(())
}

fn process_sell(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let [trader, global, curve, treasury, creator, _mint, _vault, _trader_ata, _token, _system] =
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
    let g = load_global(global)?;
    let mut c = load_curve(curve)?;
    let quote = math::quote_sell(
        token_in,
        g.protocol_fee_bps,
        c.virtual_sol_reserve,
        c.virtual_token_reserve,
        c.reserve_sol,
        c.sold_tokens,
    )
    .ok_or(ProgramError::InvalidArgument)?;
    if quote.lamports_out < min_sol || quote.lamports_out == 0 {
        return Err(ProgramError::InvalidArgument);
    }

    let gross = quote
        .lamports_out
        .checked_add(quote.fee_lamports)
        .ok_or(ProgramError::InvalidAccountData)?;
    c.reserve_sol = c
        .reserve_sol
        .checked_sub(gross)
        .ok_or(ProgramError::InvalidAccountData)?;
    c.sold_tokens = c
        .sold_tokens
        .checked_sub(token_in)
        .ok_or(ProgramError::InvalidAccountData)?;
    store_curve(curve, c)?;

    // Direct lamport move curve → trader (no CPI needed when program owns curve)
    *curve.try_borrow_mut_lamports()? -= quote.lamports_out;
    *trader.try_borrow_mut_lamports()? += quote.lamports_out;

    split_fees(curve, creator, treasury, &g, quote.fee_lamports)?;
    log!("pump:sell");
    Ok(())
}

fn split_fees(
    curve: &AccountInfo,
    creator: &AccountInfo,
    treasury: &AccountInfo,
    g: &GlobalConfig,
    fee: u64,
) -> ProgramResult {
    if fee == 0 {
        return Ok(());
    }
    let creator_fee = (fee as u128)
        .checked_mul(g.creator_fee_share_bps as u128)
        .ok_or(ProgramError::InvalidAccountData)?
        .checked_div(BPS as u128)
        .ok_or(ProgramError::InvalidAccountData)? as u64;
    let treasury_fee = fee
        .checked_sub(creator_fee)
        .ok_or(ProgramError::InvalidAccountData)?;
    if creator_fee > 0 {
        *curve.try_borrow_mut_lamports()? -= creator_fee;
        *creator.try_borrow_mut_lamports()? += creator_fee;
    }
    if treasury_fee > 0 {
        *curve.try_borrow_mut_lamports()? -= treasury_fee;
        *treasury.try_borrow_mut_lamports()? += treasury_fee;
    }
    Ok(())
}

fn process_withdraw(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let [authority, vault, to] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
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
