import { gsap } from '../../lib/gsap'
import { prefersReducedMotion } from '../../lib/motion'

/** Clone `el` and fly it to the header cart button (original `_f`). */
export function flyToCart(el) {
  const cartBtn = document.querySelector('.cart-btn')
  if (!cartBtn || !el || prefersReducedMotion()) return
  const from = el.getBoundingClientRect()
  const to = cartBtn.getBoundingClientRect()
  if (!from.width || !to.width) return
  const clone = el.cloneNode(true)
  clone.className = 'cart-fly'
  clone.removeAttribute('loading')
  Object.assign(clone.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  })
  document.body.appendChild(clone)
  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  const scale = 28 / Math.max(from.width, from.height)
  gsap
    .timeline({
      onComplete: () => {
        clone.remove()
        cartBtn.classList.remove('cart-btn--land')
        cartBtn.offsetWidth
        cartBtn.classList.add('cart-btn--land')
      },
    })
    .to(clone, { x: dx, duration: 0.75, ease: 'power1.inOut' }, 0)
    .to(clone, { y: Math.min(dy, 0) - 90, duration: 0.35, ease: 'power2.out' }, 0)
    .to(clone, { y: dy, duration: 0.4, ease: 'power2.in' }, 0.35)
    .to(clone, { scale, rotate: -20, duration: 0.75, ease: 'power2.in' }, 0)
    .to(clone, { autoAlpha: 0, duration: 0.15 }, 0.62)
}

/** Floating "+1" above `el` (original `vf`). */
export function floatPlusOne(el) {
  if (!el || prefersReducedMotion()) return
  const rect = el.getBoundingClientRect()
  const span = document.createElement('span')
  span.className = 'cart-plus'
  span.textContent = '+1'
  span.style.left = `${rect.left + rect.width / 2}px`
  span.style.top = `${rect.top}px`
  document.body.appendChild(span)
  gsap.fromTo(
    span,
    { xPercent: -50, y: 0, scale: 0.6, autoAlpha: 0 },
    {
      y: -46,
      scale: 1,
      autoAlpha: 1,
      duration: 0.35,
      ease: 'back.out(2.5)',
      onComplete: () =>
        gsap.to(span, {
          y: -70,
          autoAlpha: 0,
          duration: 0.35,
          ease: 'power1.in',
          onComplete: () => span.remove(),
        }),
    },
  )
}
