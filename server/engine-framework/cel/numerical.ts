// ═══════════════════════════════════════════════════════════════════════════════
// CEL — Numerical Methods (Level 1: LLX scope)
//
// Bisection, Newton-Raphson (with bisection fallback), linear interpolation.
// All solvers return convergence metadata — no silent failure.
// ═══════════════════════════════════════════════════════════════════════════════

import { EngineeringInputError, assertFinite, assertPositive } from './utilities';

export interface SolverResult {
  root: number;
  iterations: number;
  converged: boolean;
  residual: number;
  method: string;
}

/**
 * Bisection solver for f(x) = 0 on the bracket [a, b].
 * Requires f(a)·f(b) < 0 (sign change).
 */
export function bisectionSolve(
  f: (x: number) => number,
  a: number,
  b: number,
  tolerance = 1e-10,
  maxIterations = 200,
): SolverResult {
  assertFinite(a, 'a'); assertFinite(b, 'b'); assertPositive(tolerance, 'tolerance');
  if (a >= b) throw new EngineeringInputError(`Bisection bracket invalid: a (${a}) must be < b (${b}).`);
  let fa = f(a); let fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
    throw new EngineeringInputError('Bisection: f(a) or f(b) is not finite.');
  }
  if (fa === 0) return { root: a, iterations: 0, converged: true, residual: 0, method: 'bisection' };
  if (fb === 0) return { root: b, iterations: 0, converged: true, residual: 0, method: 'bisection' };
  if (fa * fb > 0) {
    throw new EngineeringInputError(
      `Bisection requires a sign change on [a, b]: f(${a}) = ${fa}, f(${b}) = ${fb}.`,
    );
  }
  let lo = a, hi = b, mid = a, fm = fa;
  let i = 0;
  for (; i < maxIterations; i++) {
    mid = 0.5 * (lo + hi);
    fm = f(mid);
    if (!Number.isFinite(fm)) throw new EngineeringInputError(`Bisection: f(${mid}) is not finite.`);
    if (Math.abs(fm) <= tolerance || (hi - lo) / 2 <= tolerance) {
      return { root: mid, iterations: i + 1, converged: true, residual: fm, method: 'bisection' };
    }
    if (fa * fm < 0) { hi = mid; } else { lo = mid; fa = fm; }
  }
  return { root: mid, iterations: i, converged: false, residual: fm, method: 'bisection' };
}

/**
 * Newton-Raphson solver. If the derivative vanishes or iteration diverges,
 * falls back to bisection when a valid bracket is supplied.
 */
export function newtonRaphsonSolve(
  f: (x: number) => number,
  dfdx: (x: number) => number,
  initialGuess: number,
  tolerance = 1e-10,
  maxIterations = 100,
  fallbackBracket?: { a: number; b: number },
): SolverResult {
  assertFinite(initialGuess, 'initialGuess'); assertPositive(tolerance, 'tolerance');
  let x = initialGuess;
  for (let i = 0; i < maxIterations; i++) {
    const fx = f(x);
    if (!Number.isFinite(fx)) break;
    if (Math.abs(fx) <= tolerance) {
      return { root: x, iterations: i, converged: true, residual: fx, method: 'newton-raphson' };
    }
    const d = dfdx(x);
    if (!Number.isFinite(d) || Math.abs(d) < 1e-300) break; // derivative vanished
    const xNew = x - fx / d;
    if (!Number.isFinite(xNew)) break;
    if (Math.abs(xNew - x) <= tolerance * Math.max(1, Math.abs(xNew))) {
      const r = f(xNew);
      return { root: xNew, iterations: i + 1, converged: true, residual: r, method: 'newton-raphson' };
    }
    x = xNew;
  }
  // Fallback
  if (fallbackBracket) {
    const res = bisectionSolve(f, fallbackBracket.a, fallbackBracket.b, tolerance);
    return { ...res, method: 'newton-raphson→bisection-fallback' };
  }
  return { root: x, iterations: maxIterations, converged: false, residual: f(x), method: 'newton-raphson' };
}

/**
 * Linear interpolation in a monotonically increasing x-table.
 * Extrapolation beyond the table throws by default; pass allowExtrapolation
 * to clamp-extrapolate linearly from the end segments.
 */
export function linearInterpolate(
  xTable: number[],
  yTable: number[],
  x: number,
  allowExtrapolation = false,
): number {
  if (xTable.length !== yTable.length || xTable.length < 2) {
    throw new EngineeringInputError('Interpolation tables must have equal length ≥ 2.');
  }
  for (let i = 1; i < xTable.length; i++) {
    if (xTable[i] <= xTable[i - 1]) {
      throw new EngineeringInputError('Interpolation x-table must be strictly increasing.');
    }
  }
  assertFinite(x, 'x');
  const n = xTable.length;
  if (x < xTable[0] || x > xTable[n - 1]) {
    if (!allowExtrapolation) {
      throw new EngineeringInputError(
        `Interpolation point x = ${x} is outside table range [${xTable[0]}, ${xTable[n - 1]}].`,
      );
    }
  }
  // Locate segment (clamped for extrapolation)
  let i = 0;
  if (x >= xTable[n - 2]) i = n - 2;
  else { while (i < n - 2 && x > xTable[i + 1]) i++; }
  const t = (x - xTable[i]) / (xTable[i + 1] - xTable[i]);
  return yTable[i] + t * (yTable[i + 1] - yTable[i]);
}

/**
 * Golden-section maximisation of f on [a, b].
 * Used for flooding-point analysis (maximise dispersed throughput vs holdup).
 */
export function goldenSectionMaximize(
  f: (x: number) => number,
  a: number,
  b: number,
  tolerance = 1e-8,
  maxIterations = 200,
): { x: number; fx: number; iterations: number; converged: boolean } {
  if (a >= b) throw new EngineeringInputError(`Bracket invalid: a (${a}) must be < b (${b}).`);
  const phi = (Math.sqrt(5) - 1) / 2;
  let lo = a, hi = b;
  let x1 = hi - phi * (hi - lo);
  let x2 = lo + phi * (hi - lo);
  let f1 = f(x1), f2 = f(x2);
  let i = 0;
  for (; i < maxIterations && hi - lo > tolerance; i++) {
    if (f1 < f2) {
      lo = x1; x1 = x2; f1 = f2;
      x2 = lo + phi * (hi - lo); f2 = f(x2);
    } else {
      hi = x2; x2 = x1; f2 = f1;
      x1 = hi - phi * (hi - lo); f1 = f(x1);
    }
  }
  const x = 0.5 * (lo + hi);
  return { x, fx: f(x), iterations: i, converged: hi - lo <= tolerance };
}
