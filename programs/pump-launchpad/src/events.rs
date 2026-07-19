//! Anchor-compatible `Program data:` events for indexer-sol.
//! Discriminator = sha256("event:{Name}")[0..8]; body = borsh fields.

use pinocchio::log::sol_log_data;

const DISC_TOKEN_CREATED: [u8; 8] = [0xec, 0x13, 0x29, 0xff, 0x82, 0x4e, 0x93, 0xac];
const DISC_TRADE_EVENT: [u8; 8] = [0xbd, 0xdb, 0x7f, 0xd3, 0x4e, 0xe6, 0x61, 0xee];
const DISC_FEE_SPLIT: [u8; 8] = [0x54, 0xe9, 0x74, 0xac, 0xb3, 0xb9, 0x4f, 0xce];
const DISC_REFERRER_SET: [u8; 8] = [0xd7, 0x63, 0xd4, 0x8c, 0x3b, 0xef, 0x5f, 0x23];

fn write_u64(buf: &mut [u8], off: &mut usize, v: u64) {
    buf[*off..*off + 8].copy_from_slice(&v.to_le_bytes());
    *off += 8;
}

fn write_u8(buf: &mut [u8], off: &mut usize, v: u8) {
    buf[*off] = v;
    *off += 1;
}

fn write_pubkey(buf: &mut [u8], off: &mut usize, pk: &[u8; 32]) {
    buf[*off..*off + 32].copy_from_slice(pk);
    *off += 32;
}

fn write_string(buf: &mut [u8], off: &mut usize, s: &[u8]) {
    let len = s.len() as u32;
    buf[*off..*off + 4].copy_from_slice(&len.to_le_bytes());
    *off += 4;
    if !s.is_empty() {
        buf[*off..*off + s.len()].copy_from_slice(s);
        *off += s.len();
    }
}

fn emit(buf: &[u8]) {
    sol_log_data(&[buf]);
}

pub fn emit_token_created(
    mint: &[u8; 32],
    creator: &[u8; 32],
    name: &[u8],
    symbol: &[u8],
    uri: &[u8],
    total_supply: u64,
    virtual_sol_reserve: u64,
    decimals: u8,
) {
    // mint + creator + name + symbol + uri + total_supply + virtual_sol + decimals
    let mut buf = [0u8; 512];
    buf[..8].copy_from_slice(&DISC_TOKEN_CREATED);
    let mut off = 8;
    write_pubkey(&mut buf, &mut off, mint);
    write_pubkey(&mut buf, &mut off, creator);
    write_string(&mut buf, &mut off, name);
    write_string(&mut buf, &mut off, symbol);
    write_string(&mut buf, &mut off, uri);
    write_u64(&mut buf, &mut off, total_supply);
    write_u64(&mut buf, &mut off, virtual_sol_reserve);
    write_u8(&mut buf, &mut off, decimals);
    emit(&buf[..off]);
}

pub fn emit_trade_event(
    mint: &[u8; 32],
    trader: &[u8; 32],
    is_buy: bool,
    sol_amount: u64,
    token_amount: u64,
    fee_lamports: u64,
    reserve_sol: u64,
    sold_tokens: u64,
    spot_price: u64,
) {
    let mut buf = [0u8; 8 + 32 + 32 + 1 + 8 * 6];
    buf[..8].copy_from_slice(&DISC_TRADE_EVENT);
    let mut off = 8;
    write_pubkey(&mut buf, &mut off, mint);
    write_pubkey(&mut buf, &mut off, trader);
    write_u8(&mut buf, &mut off, if is_buy { 1 } else { 0 });
    write_u64(&mut buf, &mut off, sol_amount);
    write_u64(&mut buf, &mut off, token_amount);
    write_u64(&mut buf, &mut off, fee_lamports);
    write_u64(&mut buf, &mut off, reserve_sol);
    write_u64(&mut buf, &mut off, sold_tokens);
    write_u64(&mut buf, &mut off, spot_price);
    emit(&buf[..off]);
}

pub fn emit_fee_split(
    mint: &[u8; 32],
    creator: &[u8; 32],
    creator_fee: u64,
    referrer_fee: u64,
    treasury_fee: u64,
) {
    let mut buf = [0u8; 8 + 32 + 32 + 8 * 3];
    buf[..8].copy_from_slice(&DISC_FEE_SPLIT);
    let mut off = 8;
    write_pubkey(&mut buf, &mut off, mint);
    write_pubkey(&mut buf, &mut off, creator);
    write_u64(&mut buf, &mut off, creator_fee);
    write_u64(&mut buf, &mut off, referrer_fee);
    write_u64(&mut buf, &mut off, treasury_fee);
    emit(&buf[..off]);
}

pub fn emit_referrer_set(trader: &[u8; 32], referrer: &[u8; 32]) {
    let mut buf = [0u8; 8 + 32 + 32];
    buf[..8].copy_from_slice(&DISC_REFERRER_SET);
    let mut off = 8;
    write_pubkey(&mut buf, &mut off, trader);
    write_pubkey(&mut buf, &mut off, referrer);
    emit(&buf[..off]);
}
