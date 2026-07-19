//! Protocol fee vault (EVM `LaunchpadTreasury` counterpart).

use anchor_lang::prelude::*;

declare_id!("8aT5qz6nPYCVCX1ZJBxfyCD46u46XY7dymBtRp3Jy5kq");

pub const GLOBAL_SEED: &[u8] = b"global";
pub const VAULT_SEED: &[u8] = b"vault";

#[program]
pub mod pump_treasury {
    use super::*;

    pub fn initialize(ctx: Context<InitializeTreasury>) -> Result<()> {
        let global = &mut ctx.accounts.global;
        global.authority = ctx.accounts.authority.key();
        global.bump = ctx.bumps.global;
        global.vault_bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, TreasuryError::InvalidAmount);
        let vault_ai = ctx.accounts.vault.to_account_info();
        let lamports = vault_ai.lamports();
        require!(lamports >= amount, TreasuryError::InsufficientFunds);

        **vault_ai.try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.to.to_account_info().try_borrow_mut_lamports()? += amount;

        emit!(TreasuryWithdraw {
            to: ctx.accounts.to.key(),
            amount,
        });
        Ok(())
    }
}

#[account]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub bump: u8,
    pub vault_bump: u8,
}

impl GlobalConfig {
    pub const LEN: usize = 8 + 32 + 1 + 1;
}

#[event]
pub struct TreasuryWithdraw {
    pub to: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = GlobalConfig::LEN, seeds = [GLOBAL_SEED], bump)]
    pub global: Account<'info, GlobalConfig>,
    /// CHECK: vault PDA (may be empty; receives SOL as curve.treasury when configured)
    #[account(mut, seeds = [VAULT_SEED], bump)]
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [GLOBAL_SEED],
        bump = global.bump,
        has_one = authority @ TreasuryError::Unauthorized
    )]
    pub global: Account<'info, GlobalConfig>,
    /// CHECK: vault PDA
    #[account(mut, seeds = [VAULT_SEED], bump = global.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: destination
    #[account(mut)]
    pub to: UncheckedAccount<'info>,
}

#[error_code]
pub enum TreasuryError {
    #[msg("Only treasury authority")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient vault balance")]
    InsufficientFunds,
}
