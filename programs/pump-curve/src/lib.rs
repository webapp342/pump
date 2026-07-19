//! Unified Pump launchpad program (factory + curve + treasury).
//! One binary → one ProgramData rent bill (mainnet cost optimization).
//! Permanent SOL↔token bonding curve — no graduation.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as TokenTransfer};

pub mod factory;
pub mod math;
pub mod treasury;

pub use factory::{CreateMeme, InitializeFactory};
pub use treasury::{InitializeTreasury, WithdrawTreasury};

// Anchor #[program] resolves __client_accounts_* at crate root.
pub(crate) use factory::__client_accounts_create_meme;
pub(crate) use factory::__client_accounts_initialize_factory;
pub(crate) use treasury::__client_accounts_initialize_treasury;
pub(crate) use treasury::__client_accounts_withdraw_treasury;

declare_id!("28AYQYZW7J9gkYcDJiebYCfXKYuyFEr2xNn7xKwAsZer");

pub const GLOBAL_SEED: &[u8] = b"global";
pub const CURVE_SEED: &[u8] = b"curve";
pub const PENDING_FEES_SEED: &[u8] = b"pending-fees";
pub const TRADER_SEED: &[u8] = b"trader";
pub const BPS: u64 = 10_000;
pub const TOKEN_UNIT_9: u64 = 1_000_000_000;

#[program]
pub mod pump_curve {
    use super::*;

    // ── Treasury ────────────────────────────────────────────────────────────
    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        treasury::initialize_treasury(ctx)
    }

    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
        treasury::withdraw_treasury(ctx, amount)
    }

    // ── Factory ─────────────────────────────────────────────────────────────
    pub fn initialize_factory(
        ctx: Context<InitializeFactory>,
        create_fee_lamports: u64,
        default_virtual_sol_reserve: u64,
        default_virtual_token_reserve: u64,
        default_total_supply: u64,
        token_decimals: u8,
    ) -> Result<()> {
        factory::initialize_factory(
            ctx,
            create_fee_lamports,
            default_virtual_sol_reserve,
            default_virtual_token_reserve,
            default_total_supply,
            token_decimals,
        )
    }

    pub fn create_meme(
        ctx: Context<CreateMeme>,
        name: String,
        symbol: String,
        uri: String,
        min_initial_buy_tokens: u64,
    ) -> Result<()> {
        factory::create_meme(ctx, name, symbol, uri, min_initial_buy_tokens)
    }

    // ── Curve ───────────────────────────────────────────────────────────────
    pub fn initialize(
        ctx: Context<InitializeCurveProgram>,
        protocol_fee_bps: u64,
        creator_fee_share_bps: u64,
        referrer_share_bps: u64,
        verified_referrer_share_bps: u64,
    ) -> Result<()> {
        require!(protocol_fee_bps <= BPS, CurveError::InvalidBps);
        require!(creator_fee_share_bps <= BPS, CurveError::InvalidBps);
        require!(referrer_share_bps <= BPS, CurveError::InvalidBps);
        require!(verified_referrer_share_bps <= BPS, CurveError::InvalidBps);

        let global = &mut ctx.accounts.global;
        global.authority = ctx.accounts.authority.key();
        global.treasury = ctx.accounts.treasury.key();
        global.factory_signer = ctx.accounts.factory_signer.key();
        global.protocol_fee_bps = protocol_fee_bps;
        global.creator_fee_share_bps = creator_fee_share_bps;
        global.referrer_share_bps = referrer_share_bps;
        global.verified_referrer_share_bps = verified_referrer_share_bps;
        global.emergency_halt = false;
        global.bump = ctx.bumps.global;
        Ok(())
    }

    pub fn register_curve(
        ctx: Context<RegisterCurve>,
        virtual_sol_reserve: u64,
        virtual_token_reserve: u64,
        total_supply: u64,
    ) -> Result<()> {
        require!(
            virtual_sol_reserve > 0 && virtual_token_reserve > 0 && total_supply > 0,
            CurveError::InvalidConfig
        );
        require!(
            virtual_token_reserve == total_supply,
            CurveError::InvalidConfig
        );
        require!(
            ctx.accounts.curve_token_vault.amount >= total_supply,
            CurveError::InvalidConfig
        );
        require_keys_eq!(
            ctx.accounts.curve_token_vault.owner,
            ctx.accounts.curve.key(),
            CurveError::InvalidConfig
        );

        let curve = &mut ctx.accounts.curve;
        curve.mint = ctx.accounts.mint.key();
        curve.creator = ctx.accounts.creator.key();
        curve.reserve_sol = 0;
        curve.sold_tokens = 0;
        curve.virtual_sol_reserve = virtual_sol_reserve;
        curve.virtual_token_reserve = virtual_token_reserve;
        curve.total_supply = total_supply;
        curve.token_vault = ctx.accounts.curve_token_vault.key();
        curve.paused = false;
        curve.bump = ctx.bumps.curve;

        emit!(TokenRegistered {
            mint: curve.mint,
            creator: curve.creator,
            total_supply,
            virtual_sol_reserve,
            virtual_token_reserve,
        });
        Ok(())
    }

    pub fn buy(ctx: Context<TradeBuy>, sol_in: u64, min_token_out: u64) -> Result<()> {
        require!(!ctx.accounts.global.emergency_halt, CurveError::Halted);
        require!(!ctx.accounts.curve.paused, CurveError::Paused);
        require!(sol_in > 0, CurveError::InvalidAmount);

        let quote = math::quote_buy(
            sol_in,
            ctx.accounts.global.protocol_fee_bps,
            ctx.accounts.curve.virtual_sol_reserve,
            ctx.accounts.curve.virtual_token_reserve,
            ctx.accounts.curve.reserve_sol,
            ctx.accounts.curve.sold_tokens,
        )
        .ok_or(CurveError::MathOverflow)?;
        require!(quote.token_out >= min_token_out, CurveError::Slippage);
        require!(quote.token_out > 0, CurveError::InsufficientOutput);

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.trader.to_account_info(),
                    to: ctx.accounts.curve.to_account_info(),
                },
            ),
            sol_in,
        )?;

        let mint_key = ctx.accounts.mint.key();
        let bump = ctx.accounts.curve.bump;
        {
            let curve = &mut ctx.accounts.curve;
            curve.reserve_sol = curve
                .reserve_sol
                .checked_add(quote.net_lamports)
                .ok_or(CurveError::MathOverflow)?;
            curve.sold_tokens = curve
                .sold_tokens
                .checked_add(quote.token_out)
                .ok_or(CurveError::MathOverflow)?;
        }

        let seeds: &[&[u8]] = &[CURVE_SEED, mint_key.as_ref(), &[bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TokenTransfer {
                    from: ctx.accounts.curve_token_vault.to_account_info(),
                    to: ctx.accounts.trader_ata.to_account_info(),
                    authority: ctx.accounts.curve.to_account_info(),
                },
                &[seeds],
            ),
            quote.token_out,
        )?;

        ctx.accounts.trader_state.trader = ctx.accounts.trader.key();
        ctx.accounts.trader_state.has_traded = true;
        ctx.accounts.trader_state.bump = ctx.bumps.trader_state;

        split_fees_immediate(&ctx, quote.fee_lamports)?;

        emit!(TradeEvent {
            mint: mint_key,
            trader: ctx.accounts.trader.key(),
            is_buy: true,
            sol_amount: sol_in,
            token_amount: quote.token_out,
            fee_lamports: quote.fee_lamports,
            reserve_sol: ctx.accounts.curve.reserve_sol,
            sold_tokens: ctx.accounts.curve.sold_tokens,
            spot_price: math::spot_price_lamports_per_token(
                ctx.accounts.curve.virtual_sol_reserve,
                ctx.accounts.curve.virtual_token_reserve,
                ctx.accounts.curve.reserve_sol,
                ctx.accounts.curve.sold_tokens,
                TOKEN_UNIT_9,
            ),
        });
        Ok(())
    }

    pub fn sell(ctx: Context<TradeSell>, token_in: u64, min_sol_out: u64) -> Result<()> {
        require!(!ctx.accounts.global.emergency_halt, CurveError::Halted);
        require!(!ctx.accounts.curve.paused, CurveError::Paused);
        require!(token_in > 0, CurveError::InvalidAmount);

        let quote = math::quote_sell(
            token_in,
            ctx.accounts.global.protocol_fee_bps,
            ctx.accounts.curve.virtual_sol_reserve,
            ctx.accounts.curve.virtual_token_reserve,
            ctx.accounts.curve.reserve_sol,
            ctx.accounts.curve.sold_tokens,
        )
        .ok_or(CurveError::MathOverflow)?;
        require!(quote.lamports_out >= min_sol_out, CurveError::Slippage);
        require!(quote.lamports_out > 0, CurveError::InsufficientOutput);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TokenTransfer {
                    from: ctx.accounts.trader_ata.to_account_info(),
                    to: ctx.accounts.curve_token_vault.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            token_in,
        )?;

        let mint_key = ctx.accounts.mint.key();
        {
            let curve = &mut ctx.accounts.curve;
            let gross = quote
                .lamports_out
                .checked_add(quote.fee_lamports)
                .ok_or(CurveError::MathOverflow)?;
            curve.reserve_sol = curve
                .reserve_sol
                .checked_sub(gross)
                .ok_or(CurveError::MathOverflow)?;
            curve.sold_tokens = curve
                .sold_tokens
                .checked_sub(token_in)
                .ok_or(CurveError::MathOverflow)?;
        }

        **ctx
            .accounts
            .curve
            .to_account_info()
            .try_borrow_mut_lamports()? -= quote.lamports_out;
        **ctx
            .accounts
            .trader
            .to_account_info()
            .try_borrow_mut_lamports()? += quote.lamports_out;

        ctx.accounts.trader_state.trader = ctx.accounts.trader.key();
        ctx.accounts.trader_state.has_traded = true;
        ctx.accounts.trader_state.bump = ctx.bumps.trader_state;

        split_fees_immediate_sell(&ctx, quote.fee_lamports)?;

        emit!(TradeEvent {
            mint: mint_key,
            trader: ctx.accounts.trader.key(),
            is_buy: false,
            sol_amount: quote.gross_lamports,
            token_amount: token_in,
            fee_lamports: quote.fee_lamports,
            reserve_sol: ctx.accounts.curve.reserve_sol,
            sold_tokens: ctx.accounts.curve.sold_tokens,
            spot_price: math::spot_price_lamports_per_token(
                ctx.accounts.curve.virtual_sol_reserve,
                ctx.accounts.curve.virtual_token_reserve,
                ctx.accounts.curve.reserve_sol,
                ctx.accounts.curve.sold_tokens,
                TOKEN_UNIT_9,
            ),
        });
        Ok(())
    }

    pub fn set_referrer(ctx: Context<SetReferrer>) -> Result<()> {
        require!(
            !ctx.accounts.trader_state.has_traded,
            CurveError::AlreadyTraded
        );
        require_keys_neq!(
            ctx.accounts.trader.key(),
            ctx.accounts.referrer.key(),
            CurveError::InvalidReferrer
        );
        let binding = &mut ctx.accounts.referrer_binding;
        binding.trader = ctx.accounts.trader.key();
        binding.referrer = ctx.accounts.referrer.key();
        binding.bump = ctx.bumps.referrer_binding;
        emit!(ReferrerSetEvent {
            trader: binding.trader,
            referrer: binding.referrer,
        });
        Ok(())
    }

    /// Accrue path kept for EVM parity API; Phase 1b pays fees immediately on trade.
    /// This moves lamports already sitting on a PendingFees PDA to the owner.
    pub fn claim_pending_fees(ctx: Context<ClaimPendingFees>) -> Result<()> {
        let amount = ctx.accounts.pending_fees.amount;
        require!(amount > 0, CurveError::NothingToClaim);
        ctx.accounts.pending_fees.amount = 0;
        **ctx
            .accounts
            .pending_fees
            .to_account_info()
            .try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .claimant
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;
        emit!(FeesClaimed {
            owner: ctx.accounts.claimant.key(),
            amount,
        });
        Ok(())
    }

    pub fn set_emergency_halt(ctx: Context<AuthGlobal>, halted: bool) -> Result<()> {
        ctx.accounts.global.emergency_halt = halted;
        Ok(())
    }

    pub fn pause_curve(ctx: Context<PauseCurve>, paused: bool) -> Result<()> {
        ctx.accounts.curve.paused = paused;
        Ok(())
    }
}

fn split_fees_immediate(ctx: &Context<TradeBuy>, fee_lamports: u64) -> Result<()> {
    if fee_lamports == 0 {
        return Ok(());
    }
    let creator_fee = fee_share(fee_lamports, ctx.accounts.global.creator_fee_share_bps)?;
    let referrer_fee = match &ctx.accounts.referrer_binding {
        Some(b) if b.referrer != Pubkey::default() => {
            fee_share(fee_lamports, ctx.accounts.global.referrer_share_bps)?
        }
        _ => 0,
    };
    let treasury_fee = fee_lamports
        .checked_sub(creator_fee)
        .ok_or(CurveError::MathOverflow)?
        .checked_sub(referrer_fee)
        .ok_or(CurveError::MathOverflow)?;

    let curve_ai = ctx.accounts.curve.to_account_info();
    if creator_fee > 0 {
        **curve_ai.try_borrow_mut_lamports()? -= creator_fee;
        **ctx.accounts.creator.to_account_info().try_borrow_mut_lamports()? += creator_fee;
    }
    if referrer_fee > 0 {
        **curve_ai.try_borrow_mut_lamports()? -= referrer_fee;
        **ctx
            .accounts
            .referrer_wallet
            .to_account_info()
            .try_borrow_mut_lamports()? += referrer_fee;
    }
    if treasury_fee > 0 {
        **curve_ai.try_borrow_mut_lamports()? -= treasury_fee;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += treasury_fee;
    }

    emit!(FeeSplitEvent {
        mint: ctx.accounts.curve.mint,
        creator: ctx.accounts.curve.creator,
        creator_fee,
        referrer_fee,
        treasury_fee,
    });
    Ok(())
}

fn split_fees_immediate_sell(ctx: &Context<TradeSell>, fee_lamports: u64) -> Result<()> {
    if fee_lamports == 0 {
        return Ok(());
    }
    let creator_fee = fee_share(fee_lamports, ctx.accounts.global.creator_fee_share_bps)?;
    let referrer_fee = match &ctx.accounts.referrer_binding {
        Some(b) if b.referrer != Pubkey::default() => {
            fee_share(fee_lamports, ctx.accounts.global.referrer_share_bps)?
        }
        _ => 0,
    };
    let treasury_fee = fee_lamports
        .checked_sub(creator_fee)
        .ok_or(CurveError::MathOverflow)?
        .checked_sub(referrer_fee)
        .ok_or(CurveError::MathOverflow)?;

    let curve_ai = ctx.accounts.curve.to_account_info();
    if creator_fee > 0 {
        **curve_ai.try_borrow_mut_lamports()? -= creator_fee;
        **ctx.accounts.creator.to_account_info().try_borrow_mut_lamports()? += creator_fee;
    }
    if referrer_fee > 0 {
        **curve_ai.try_borrow_mut_lamports()? -= referrer_fee;
        **ctx
            .accounts
            .referrer_wallet
            .to_account_info()
            .try_borrow_mut_lamports()? += referrer_fee;
    }
    if treasury_fee > 0 {
        **curve_ai.try_borrow_mut_lamports()? -= treasury_fee;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += treasury_fee;
    }

    emit!(FeeSplitEvent {
        mint: ctx.accounts.curve.mint,
        creator: ctx.accounts.curve.creator,
        creator_fee,
        referrer_fee,
        treasury_fee,
    });
    Ok(())
}

fn fee_share(fee: u64, bps: u64) -> Result<u64> {
    Ok((fee as u128)
        .checked_mul(bps as u128)
        .ok_or(CurveError::MathOverflow)?
        .checked_div(BPS as u128)
        .ok_or(CurveError::MathOverflow)? as u64)
}

// ─── State ───────────────────────────────────────────────────────────────────

#[account]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub factory_signer: Pubkey,
    pub protocol_fee_bps: u64,
    pub creator_fee_share_bps: u64,
    pub referrer_share_bps: u64,
    pub verified_referrer_share_bps: u64,
    pub emergency_halt: bool,
    pub bump: u8,
}

impl GlobalConfig {
    pub const LEN: usize = 8 + 32 * 3 + 8 * 4 + 1 + 1;
}

#[account]
pub struct Curve {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub token_vault: Pubkey,
    pub reserve_sol: u64,
    pub sold_tokens: u64,
    pub virtual_sol_reserve: u64,
    pub virtual_token_reserve: u64,
    pub total_supply: u64,
    pub paused: bool,
    pub bump: u8,
}

impl Curve {
    pub const LEN: usize = 8 + 32 * 3 + 8 * 5 + 1 + 1;
}

#[account]
pub struct ReferrerBinding {
    pub trader: Pubkey,
    pub referrer: Pubkey,
    pub bump: u8,
}

impl ReferrerBinding {
    pub const LEN: usize = 8 + 32 + 32 + 1;
    pub const SEED: &'static [u8] = b"referrer";
}

#[account]
pub struct PendingFees {
    pub owner: Pubkey,
    pub amount: u64,
    pub bump: u8,
}

impl PendingFees {
    pub const LEN: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct TraderState {
    pub trader: Pubkey,
    pub has_traded: bool,
    pub bump: u8,
}

impl TraderState {
    pub const LEN: usize = 8 + 32 + 1 + 1;
}

#[event]
pub struct TokenRegistered {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub total_supply: u64,
    pub virtual_sol_reserve: u64,
    pub virtual_token_reserve: u64,
}

#[event]
pub struct TradeEvent {
    pub mint: Pubkey,
    pub trader: Pubkey,
    pub is_buy: bool,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub fee_lamports: u64,
    pub reserve_sol: u64,
    pub sold_tokens: u64,
    pub spot_price: u64,
}

#[event]
pub struct FeeSplitEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub creator_fee: u64,
    pub referrer_fee: u64,
    pub treasury_fee: u64,
}

#[event]
pub struct ReferrerSetEvent {
    pub trader: Pubkey,
    pub referrer: Pubkey,
}

#[event]
pub struct FeesClaimed {
    pub owner: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct InitializeCurveProgram<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: fee destination
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: factory signer PDA
    pub factory_signer: UncheckedAccount<'info>,
    #[account(init, payer = authority, space = GlobalConfig::LEN, seeds = [GLOBAL_SEED], bump)]
    pub global: Account<'info, GlobalConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterCurve<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub factory_signer: Signer<'info>,
    /// CHECK: creator
    pub creator: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        seeds = [GLOBAL_SEED],
        bump = global.bump,
        constraint = factory_signer.key() == global.factory_signer
            || factory_signer.key() == global.authority
            @ CurveError::Unauthorized
    )]
    pub global: Account<'info, GlobalConfig>,
    #[account(
        init,
        payer = payer,
        space = Curve::LEN,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump
    )]
    pub curve: Account<'info, Curve>,
    #[account(
        mut,
        constraint = curve_token_vault.mint == mint.key() @ CurveError::InvalidConfig
    )]
    pub curve_token_vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TradeBuy<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [CURVE_SEED, mint.key().as_ref()], bump = curve.bump)]
    pub curve: Account<'info, Curve>,
    pub mint: Account<'info, Mint>,
    #[account(mut, address = curve.token_vault)]
    pub curve_token_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = trader
    )]
    pub trader_ata: Account<'info, TokenAccount>,
    /// CHECK: creator receives creator fee share
    #[account(mut, address = curve.creator)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: treasury
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,
    /// Optional referrer binding PDA for this trader.
    pub referrer_binding: Option<Account<'info, ReferrerBinding>>,
    /// CHECK: referrer wallet (pass trader if no referrer)
    #[account(mut)]
    pub referrer_wallet: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = trader,
        space = TraderState::LEN,
        seeds = [TRADER_SEED, trader.key().as_ref()],
        bump
    )]
    pub trader_state: Account<'info, TraderState>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TradeSell<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [CURVE_SEED, mint.key().as_ref()], bump = curve.bump)]
    pub curve: Account<'info, Curve>,
    pub mint: Account<'info, Mint>,
    #[account(mut, address = curve.token_vault)]
    pub curve_token_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = trader
    )]
    pub trader_ata: Account<'info, TokenAccount>,
    /// CHECK: creator
    #[account(mut, address = curve.creator)]
    pub creator: UncheckedAccount<'info>,
    /// CHECK: treasury
    #[account(mut, address = global.treasury)]
    pub treasury: UncheckedAccount<'info>,
    pub referrer_binding: Option<Account<'info, ReferrerBinding>>,
    /// CHECK: referrer wallet
    #[account(mut)]
    pub referrer_wallet: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = trader,
        space = TraderState::LEN,
        seeds = [TRADER_SEED, trader.key().as_ref()],
        bump
    )]
    pub trader_state: Account<'info, TraderState>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetReferrer<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    /// CHECK: referrer
    pub referrer: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = trader,
        space = TraderState::LEN,
        seeds = [TRADER_SEED, trader.key().as_ref()],
        bump
    )]
    pub trader_state: Account<'info, TraderState>,
    #[account(
        init,
        payer = trader,
        space = ReferrerBinding::LEN,
        seeds = [ReferrerBinding::SEED, trader.key().as_ref()],
        bump
    )]
    pub referrer_binding: Account<'info, ReferrerBinding>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPendingFees<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    #[account(
        mut,
        seeds = [PENDING_FEES_SEED, claimant.key().as_ref()],
        bump = pending_fees.bump,
        constraint = pending_fees.owner == claimant.key() @ CurveError::Unauthorized
    )]
    pub pending_fees: Account<'info, PendingFees>,
}

#[derive(Accounts)]
pub struct AuthGlobal<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        bump = global.bump,
        has_one = authority @ CurveError::Unauthorized
    )]
    pub global: Account<'info, GlobalConfig>,
}

#[derive(Accounts)]
pub struct PauseCurve<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [GLOBAL_SEED], bump = global.bump, has_one = authority @ CurveError::Unauthorized)]
    pub global: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [CURVE_SEED, curve.mint.as_ref()], bump = curve.bump)]
    pub curve: Account<'info, Curve>,
}

#[error_code]
pub enum CurveError {
    #[msg("BPS out of range")]
    InvalidBps,
    #[msg("Emergency halt active")]
    Halted,
    #[msg("Curve paused")]
    Paused,
    #[msg("Invalid config")]
    InvalidConfig,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Slippage")]
    Slippage,
    #[msg("Insufficient output")]
    InsufficientOutput,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Already traded")]
    AlreadyTraded,
    #[msg("Invalid referrer")]
    InvalidReferrer,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Insufficient vault balance")]
    InsufficientFunds,
}
