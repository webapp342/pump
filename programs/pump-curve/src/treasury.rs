//! Treasury instructions — merged into pump-curve (one deploy binary = one rent bill).

use anchor_lang::prelude::*;

use crate::CurveError;

pub const TREASURY_GLOBAL_SEED: &[u8] = b"treasury-global";
pub const VAULT_SEED: &[u8] = b"vault";

#[account]
pub struct TreasuryConfig {
    pub authority: Pubkey,
    pub bump: u8,
    pub vault_bump: u8,
}

impl TreasuryConfig {
    pub const LEN: usize = 8 + 32 + 1 + 1;
}

#[event]
pub struct TreasuryWithdraw {
    pub to: Pubkey,
    pub amount: u64,
}

pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
    let global = &mut ctx.accounts.treasury_global;
    global.authority = ctx.accounts.authority.key();
    global.bump = ctx.bumps.treasury_global;
    global.vault_bump = ctx.bumps.vault;
    Ok(())
}

pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
    require!(amount > 0, CurveError::InvalidAmount);
    let vault_ai = ctx.accounts.vault.to_account_info();
    let lamports = vault_ai.lamports();
    require!(lamports >= amount, CurveError::InsufficientFunds);

    **vault_ai.try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.to.to_account_info().try_borrow_mut_lamports()? += amount;

    emit!(TreasuryWithdraw {
        to: ctx.accounts.to.key(),
        amount,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = TreasuryConfig::LEN,
        seeds = [TREASURY_GLOBAL_SEED],
        bump
    )]
    pub treasury_global: Account<'info, TreasuryConfig>,
    /// CHECK: vault PDA (receives protocol fee SOL)
    #[account(mut, seeds = [VAULT_SEED], bump)]
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [TREASURY_GLOBAL_SEED],
        bump = treasury_global.bump,
        has_one = authority @ CurveError::Unauthorized
    )]
    pub treasury_global: Account<'info, TreasuryConfig>,
    /// CHECK: vault PDA
    #[account(mut, seeds = [VAULT_SEED], bump = treasury_global.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: destination
    #[account(mut)]
    pub to: UncheckedAccount<'info>,
}
