//! Meme factory — SPL mint + curve registration (EVM `MemeFactory` counterpart).

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{
    self, Mint, MintTo, SetAuthority, Token, TokenAccount, spl_token::instruction::AuthorityType,
};
use pump_curve::cpi::accounts::RegisterCurve;
use pump_curve::program::PumpCurve;
use pump_curve::{self, CURVE_SEED};

declare_id!("FJs6MkZtwcS9p7UrxKmL2twAdECGNJk4s1MffXMSZmqF");

pub const GLOBAL_SEED: &[u8] = b"global";
pub const FACTORY_SIGNER_SEED: &[u8] = b"factory-signer";

#[program]
pub mod pump_factory {
    use super::*;

    pub fn initialize(
        ctx: Context<InitializeFactory>,
        create_fee_lamports: u64,
        default_virtual_sol_reserve: u64,
        default_virtual_token_reserve: u64,
        default_total_supply: u64,
        token_decimals: u8,
    ) -> Result<()> {
        require!(
            default_total_supply > 0
                && default_virtual_sol_reserve > 0
                && default_virtual_token_reserve == default_total_supply,
            FactoryError::InvalidInput
        );
        require!(token_decimals <= 9, FactoryError::InvalidInput);

        let global = &mut ctx.accounts.global;
        global.authority = ctx.accounts.authority.key();
        global.curve_program = ctx.accounts.curve_program.key();
        global.treasury = ctx.accounts.treasury.key();
        global.create_fee_lamports = create_fee_lamports;
        global.default_virtual_sol_reserve = default_virtual_sol_reserve;
        global.default_virtual_token_reserve = default_virtual_token_reserve;
        global.default_total_supply = default_total_supply;
        global.token_decimals = token_decimals;
        global.bump = ctx.bumps.global;
        global.signer_bump = ctx.bumps.factory_signer;
        Ok(())
    }

    /// Create mint, fund curve vault with full supply, register bonding curve.
    pub fn create_meme(
        ctx: Context<CreateMeme>,
        name: String,
        symbol: String,
        uri: String,
        _min_initial_buy_tokens: u64,
    ) -> Result<()> {
        require!(
            !name.is_empty() && name.len() <= 64,
            FactoryError::InvalidInput
        );
        require!(
            !symbol.is_empty() && symbol.len() <= 16,
            FactoryError::InvalidInput
        );
        require!(uri.len() <= 256, FactoryError::InvalidInput);

        let fee = ctx.accounts.global.create_fee_lamports;
        if fee > 0 {
            transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.creator.to_account_info(),
                        to: ctx.accounts.treasury.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        let supply = ctx.accounts.global.default_total_supply;
        let v_sol = ctx.accounts.global.default_virtual_sol_reserve;
        let v_tok = ctx.accounts.global.default_virtual_token_reserve;
        let decimals = ctx.accounts.global.token_decimals;
        let signer_bump = ctx.accounts.global.signer_bump;

        let seeds: &[&[u8]] = &[FACTORY_SIGNER_SEED, &[signer_bump]];
        let signer = &[seeds];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.curve_token_vault.to_account_info(),
                    authority: ctx.accounts.factory_signer.to_account_info(),
                },
                signer,
            ),
            supply,
        )?;

        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                SetAuthority {
                    current_authority: ctx.accounts.factory_signer.to_account_info(),
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                },
                signer,
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        let cpi_accounts = RegisterCurve {
            payer: ctx.accounts.creator.to_account_info(),
            factory_signer: ctx.accounts.factory_signer.to_account_info(),
            creator: ctx.accounts.creator.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            global: ctx.accounts.curve_global.to_account_info(),
            curve: ctx.accounts.curve.to_account_info(),
            curve_token_vault: ctx.accounts.curve_token_vault.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        pump_curve::cpi::register_curve(
            CpiContext::new_with_signer(
                ctx.accounts.curve_program.to_account_info(),
                cpi_accounts,
                signer,
            ),
            v_sol,
            v_tok,
            supply,
        )?;

        emit!(TokenCreated {
            mint: ctx.accounts.mint.key(),
            creator: ctx.accounts.creator.key(),
            name,
            symbol,
            uri,
            total_supply: supply,
            virtual_sol_reserve: v_sol,
            decimals,
        });
        Ok(())
    }
}

#[account]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub curve_program: Pubkey,
    pub treasury: Pubkey,
    pub create_fee_lamports: u64,
    pub default_virtual_sol_reserve: u64,
    pub default_virtual_token_reserve: u64,
    pub default_total_supply: u64,
    pub token_decimals: u8,
    pub bump: u8,
    pub signer_bump: u8,
}

impl GlobalConfig {
    pub const LEN: usize = 8 + 32 * 3 + 8 * 4 + 1 + 1 + 1;
}

#[event]
pub struct TokenCreated {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub total_supply: u64,
    pub virtual_sol_reserve: u64,
    pub decimals: u8,
}

#[derive(Accounts)]
pub struct InitializeFactory<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: curve program id
    pub curve_program: UncheckedAccount<'info>,
    /// CHECK: create-fee destination
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: PDA signer
    #[account(seeds = [FACTORY_SIGNER_SEED], bump)]
    pub factory_signer: UncheckedAccount<'info>,
    #[account(init, payer = authority, space = GlobalConfig::LEN, seeds = [GLOBAL_SEED], bump)]
    pub global: Account<'info, GlobalConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateMeme<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, GlobalConfig>,
    /// CHECK: factory signer PDA
    #[account(seeds = [FACTORY_SIGNER_SEED], bump = global.signer_bump)]
    pub factory_signer: UncheckedAccount<'info>,
    /// CHECK: treasury
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        init,
        payer = creator,
        mint::decimals = global.token_decimals,
        mint::authority = factory_signer,
    )]
    pub mint: Account<'info, Mint>,
    /// CHECK: curve PDA (initialized via CPI)
    #[account(
        mut,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump,
        seeds::program = curve_program.key()
    )]
    pub curve: UncheckedAccount<'info>,
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = curve,
    )]
    pub curve_token_vault: Account<'info, TokenAccount>,
    /// CHECK: curve global config account
    #[account(mut)]
    pub curve_global: UncheckedAccount<'info>,
    pub curve_program: Program<'info, PumpCurve>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[error_code]
pub enum FactoryError {
    #[msg("Invalid name, symbol, URI, or supply config")]
    InvalidInput,
}
