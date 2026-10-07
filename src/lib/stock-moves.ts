/** The shop's words for why stock moved, for the movement line. */
export const MOVE_WORDS: Record<string, string> = {
  OPENING: "Opening stock",
  RECEIVED: "Received",
  SALE: "Sold",
  SALE_REVERSED: "Sale undone",
  TRANSFER_OUT: "Sent to another shop",
  TRANSFER_IN: "Came from another shop",
  RETURN_IN: "Returned by a buyer",
  REPLACEMENT_OUT: "Given as a replacement",
  RETURN_TO_SUPPLIER: "Sent back to supplier",
  SWAP_OUT: "Given on a swap",
  SWAP_IN: "Taken in on a swap",
  REPAIR_OUT: "Went to the bench",
  REPAIR_IN: "Back from the bench",
  COUNT_ADJUST: "Stock count",
  HAND_CORRECTION: "Corrected by hand",
}

/** One line in the shop's words: "Sold −2", "Received +10". */
export function moveWords(kind: string) {
  return MOVE_WORDS[kind] ?? kind
}
