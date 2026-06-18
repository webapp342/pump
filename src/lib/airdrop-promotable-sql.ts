/** Visible launchpad tokens with upcoming or qualifying airdrop (matches client promotable rules). */
export const SQL_PROMOTABLE_AIRDROP_LINKED_TOKEN_ADDRESSES = `
  SELECT DISTINCT LOWER(a.linked_token) AS address
  FROM airdrops a
  INNER JOIN tokens t ON LOWER(t.address) = LOWER(a.linked_token) AND t.is_hidden = false
  WHERE a.status <> 'CLOSED'
    AND (
      NOW() < a.qualify_start
      OR (NOW() >= a.qualify_start AND NOW() <= a.qualify_end)
    )
`;
