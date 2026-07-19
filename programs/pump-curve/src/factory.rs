//! Factory instructions — merged into pump-curve (one deploy binary = one rent bill).

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{
    self, Mint, MintTo, SetAuthority, Token, TokenAccount, spl_token::instruction::AuthorityType,
};

use crate::{Curve, CurveError, GlobalConfig, CURVE_SEED, GLOBAL_SEED};

pub const FACTORY_GLOBAL_SEED: &[u8] = b"factory-global";
pub const FACTORY_SIGNER_SEED: &[u8] = b"factory-signer";

#[account]
pub struct FactoryConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub create_fee_lamports: u64,
    pub default_virtual_sol_reserve: u64,
    pub default_virtual_token_reserve: u64,
    pub default_total_supply: u64,
    pub token_decimals: u8,
    pub bump: u8,
    pub signer_bump: u8,
}

impl FactoryConfig {
    pub const LEN: usize = 8 + 32 * 2 + 8 * 4 + 1 + 1 + 1;
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

pub fn initialize_factory(
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
        CurveError::InvalidConfig
    );
    require!(token_decimals <= 9, CurveError::InvalidConfig);

    let global = &mut ctx.accounts.factory_global;
    global.authority = ctx.accounts.authority.key();
    global.treasury = ctx.accounts.treasury.key();
    global.create_fee_lamports = create_fee_lamports;
    global.default_virtual_sol_reserve = default_virtual_sol_reserve;
    global.default_virtual_token_reserve = default_virtual_token_reserve;
    global.default_total_supply = default_total_supply;
    global.token_decimals = token_decimals;
    global.bump = ctx.bumps.factory_global;
    global.signer_bump = ctx.bumps.factory_signer;
    Ok(())
}

/// Create mint, fund curve vault, register bonding curve (same program — no CPI).
pub fn create_meme(
    ctx: Context<CreateMeme>,
    name: String,
    symbol: String,
    uri: String,
    _min_initial_buy_tokens: u64,
) -> Result<()> {
    require!(!name.is_empty() && name.len() <= 64, CurveError::InvalidConfig);
    require!(!symbol.is_empty() && symbol.len() <= 16, CurveError::InvalidConfig);
    require!(uri.len() <= 256, CurveError::InvalidConfig);

    let fee = ctx.accounts.factory_global.create_fee_lamports;
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

    let supply = ctx.accounts.factory_global.default_total_supply;
    let v_sol = ctx.accounts.factory_global.default_virtual_sol_reserve;
    let v_tok = ctx.accounts.factory_global.default_virtual_token_reserve;
    let decimals = ctx.accounts.factory_global.token_decimals;
    let signer_bump = ctx.accounts.factory_global.signer_bump;

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

    require!(
        ctx.accounts.curve_token_vault.amount >= supply,
        CurveError::InvalidConfig
    );
    require_keys_eq!(
        ctx.accounts.curve_token_vault.owner,
        ctx.accounts.curve.key(),
        CurveError::InvalidConfig
    );
    require!(v_tok == supply, CurveError::InvalidConfig);

    let curve = &mut ctx.accounts.curve;
    curve.mint = ctx.accounts.mint.key();
    curve.creator = ctx.accounts.creator.key();
    curve.reserve_sol = 0;
    curve.sold_tokens = 0;
    curve.virtual_sol_reserve = v_sol;
    curve.virtual_token_reserve = v_tok;
    curve.total_supply = supply;
    curve.token_vault = ctx.accounts.curve_token_vault.key();
    curve.paused = false;
    curve.bump = ctx.bumps.curve;

    emit!(crate::TokenRegistered {
        mint: curve.mint,
        creator: curve.creator,
        total_supply: supply,
        virtual_sol_reserve: v_sol,
        virtual_token_reserve: v_tok,
    });

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

#[derive(Accounts)]
pub struct InitializeFactory<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: create-fee destination (usually treasury vault)
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: PDA signer for mint authority
    #[account(seeds = [FACTORY_SIGNER_SEED], bump)]
    pub factory_signer: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = FactoryConfig::LEN,
        seeds = [FACTORY_GLOBAL_SEED],
        bump
    )]
    pub factory_global: Account<'info, FactoryConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateMeme<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [FACTORY_GLOBAL_SEED], bump = factory_global.bump)]
    pub factory_global: Account<'info, FactoryConfig>,
    /// CHECK: factory signer PDA
    #[account(seeds = [FACTORY_SIGNER_SEED], bump = factory_global.signer_bump)]
    pub factory_signer: UncheckedAccount<'info>,
    /// CHECK: treasury
    #[account(mut, address = factory_global.treasury)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        init,
        payer = creator,
        mint::decimals = factory_global.token_decimals,
        mint::authority = factory_signer,
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        space = Curve::LEN,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump
    )]
    pub curve: Account<'info, Curve>,
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = curve,
    )]
    pub curve_token_vault: Account<'info, TokenAccount>,
    /// Curve program global — must already be initialized; factory_signer must match.
    #[account(
        seeds = [GLOBAL_SEED],
        bump = curve_global.bump,
        constraint = factory_signer.key() == curve_global.factory_signer
            @ CurveError::Unauthorized
    )]
    pub curve_global: Account<'info, GlobalConfig>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
