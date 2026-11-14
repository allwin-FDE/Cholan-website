// Feature flags (original symbol `Ln`).
//   prices: show product prices (when false, products are "Price on request")
//   cart:   enable the cart button/drawer and the /checkout route. Off since
//           2026-11-14 at the owner's request: no buying on the website,
//           every product has Enquire instead (and /checkout goes to the
//           products). The cart code stays for website ordering later.
export const features = { prices: true, cart: false };
