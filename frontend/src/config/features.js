// Feature flags (original symbol `Ln`).
//   prices: show product prices (when false, products are "Price on request")
//   cart:   enable the cart button/drawer and the /checkout route. Back on
//           since 2026-11-19 at the owner's request, for online payment
//           (Razorpay, "Pay online now") next to cash or UPI on delivery.
//           Was off 2026-11-14 to 2026-11-19 (Enquire only), and off
//           again since 2026-11-24 at the owner's request (Enquire only).
export const features = { prices: true, cart: false };
