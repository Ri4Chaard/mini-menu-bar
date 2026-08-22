/**
 * The single import site for `motion` (research.md R-006).
 *
 * LazyMotion + `m` keeps the initial cost around 4.6 KB rather than pulling the
 * full library. Two rules make this safe regardless of library choice:
 *   - no infinite or looping animations (constitution Principle V)
 *   - animate only transform and opacity
 *
 * Confining usage here is also what makes the CSS fallback a contained change
 * if the R-006 trigger fires.
 */
import { LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react'
import type { TargetAndTransition, Transition } from 'motion/react'
import { useMemo, type ReactNode } from 'react'

export { m, useReducedMotion }

export function MotionProvider({ children }: { children: ReactNode }): ReactNode {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  )
}

/**
 * Transient enter transition used by section switches and list insertions.
 *
 * Memoised on purpose. Returning fresh object literals would give Motion a new
 * `animate` target identity on every render, restarting the animation whenever
 * anything else in the tree updated - which turns a 180 ms entrance into
 * continuous motion and breaches the no-looping-animation rule
 * (constitution Principle V).
 */
export function useFadeIn(): {
  initial: TargetAndTransition
  animate: TargetAndTransition
  transition: Transition
} {
  const reduced = useReducedMotion()
  return useMemo(
    () => ({
      // Opacity only, no translate. Panel UI v2 fixes the four bands in place,
      // and a `y` offset would visibly shift the header, divider and footer
      // during every section switch - exactly the "whole panel redrawing" read
      // that FR-046 rules out (research.md R-115).
      initial: reduced ? { opacity: 1 } : { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: reduced ? 0 : 0.18, ease: 'easeOut' }
    }),
    [reduced]
  )
}
