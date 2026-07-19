#![no_std]

//! Pump launchpad — Pinocchio (low rent + low CU).
//! Program ID: `Hwv85kSodkR34rBTE1J67aSzixnAkXdAX6HzZnKDCvus`
//!
//! Instructions (1-byte tag):
//!   0 initialize | 1 create_meme | 2 buy | 3 sell | 4 withdraw_treasury

pub mod math;

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
pub const VAULT_SEED: &[u8] = b"vault";
pub const FACTORY_SIGNER_SEED: &[u8] = b"factory-signer";

const IX_INITIALIZE: u8 = 0;
const IX_CREATE_MEME: u8 = 1;
const IX_BUY: u8 = 2;
const IX_SELL: u8 = 3;
const IX_WITHDRAW: u8 = 4;

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
    pub default_virtual_sol_reserve: u64,
    pub default_virtual_token_reserve: u64,
    pub default_total_supply: u64,
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

impl Curve {
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

/// Data: 8×u64 fees/reserves + u8 decimals (65 bytes).
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
    let (signer_pda, signer_bump) = find_program_address(&[FACTORY_SIGNER_SEED], program_id);
    if factory_signer.key() != &signer_pda {
        return Err(ProgramError::InvalidSeeds);
    }
    let (vault_pda, vault_bump) = find_program_address(&[VAULT_SEED], program_id);
    if treasury.key() != &vault_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    let protocol_fee_bps = read_u64(data, 0)?;
    let creator_fee_share_bps = read_u64(data, 8)?;
    let referrer_share_bps = read_u64(data, 16)?;
    let verified_referrer_share_bps = read_u64(data, 24)?;
    let create_fee_lamports = read_u64(data, 32)?;
    let default_virtual_sol_reserve = read_u64(data, 40)?;
    let default_virtual_token_reserve = read_u64(data, 48)?;
    let default_total_supply = read_u64(data, 56)?;
    let token_decimals = read_u8(data, 64)?;

    if protocol_fee_bps > BPS
        || creator_fee_share_bps > BPS
        || referrer_share_bps > BPS
        || verified_referrer_share_bps > BPS
    {
        return Err(ProgramError::InvalidArgument);
    }
    if default_total_supply == 0
        || default_virtual_sol_reserve == 0
        || default_virtual_token_reserve != default_total_supply
        || token_decimals > 9
    {
        return Err(ProgramError::InvalidArgument);
    }

    // Allocate global PDA on first init
    if global.lamports() == 0 {
        let space = GlobalConfig::LEN as u64;
        // rent-exempt for ~168 bytes ≈ 0.00206 SOL — leave headroom
        let lamports = 3_000_000u64;
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
        default_virtual_sol_reserve,
        default_virtual_token_reserve,
        default_total_supply,
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
/// Client pre-creates mint (authority=factory_signer), curve PDA, vault ATA.
fn process_create_meme(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _data: &[u8],
) -> ProgramResult {
    let [creator, mint, curve, vault, factory_signer, global, treasury, _token, _system] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !creator.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !owner_eq(global, program_id) || !owner_eq(curve, program_id) {
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
            lamports: 3_000_000,
            space: Curve::LEN as u64,
            owner: program_id,
        }
        .invoke_signed(&signers)?;
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

    MintTo {
        mint,
        account: vault,
        mint_authority: factory_signer,
        amount: g.default_total_supply,
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
        reserve_sol: 0,
        sold_tokens: 0,
        virtual_sol_reserve: g.default_virtual_sol_reserve,
        virtual_token_reserve: g.default_virtual_token_reserve,
        total_supply: g.default_total_supply,
        paused: 0,
        bump: curve_bump,
        _pad: [0; 6],
    };
    write_pod(curve, &c)?;
    log!("pump:create_meme");
    Ok(())
}

fn process_buy(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let [trader, global, curve, treasury, creator, mint, vault, trader_ata, _token, _system] =
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
    if c.paused != 0 || !keys_eq(&c.mint, mint.key()) || !keys_eq(&c.token_vault, vault.key()) {
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

    c.reserve_sol = c
        .reserve_sol
        .checked_add(quote.net_lamports)
        .ok_or(ProgramError::InvalidAccountData)?;
    c.sold_tokens = c
        .sold_tokens
        .checked_add(quote.token_out)
        .ok_or(ProgramError::InvalidAccountData)?;
    write_pod(curve, &c)?;

    split_fees(curve, creator, treasury, &g, quote.fee_lamports)?;
    log!("pump:buy");
    Ok(())
}

fn process_sell(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let [trader, global, curve, treasury, creator, mint, vault, trader_ata, _token, _system] =
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
    let mut c = load_pod::<Curve>(curve)?;
    if !keys_eq(&c.mint, mint.key()) || !keys_eq(&c.token_vault, vault.key()) {
        return Err(ProgramError::InvalidAccountData);
    }

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

    TokenTransfer {
        from: trader_ata,
        to: vault,
        authority: trader,
        amount: token_in,
    }
    .invoke()?;

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
    write_pod(curve, &c)?;

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
