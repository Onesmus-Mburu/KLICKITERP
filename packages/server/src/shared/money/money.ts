/**
 * Money value object — the sole representation of monetary amounts across
 * every module (docs/phase-3/01-system-architecture.md D1, NFR-INT-004).
 *
 * Internally a bigint scaled by 10^SCALE (fixed-point, matches NUMERIC(18,4)
 * exactly — docs/phase-4/01-standards-and-migrations.md §3 "Money" row).
 * No IEEE-754 float ever touches a monetary value: parsing, arithmetic and
 * serialization all operate on bigint/string.
 *
 * Rounding matrix (NFR-INT-004):
 *  - HALF_UP   (a.k.a. "round half away from zero") — the default for
 *    ordinary monetary rounding (invoice totals, fee computations).
 *  - HALF_EVEN ("banker's rounding") — used for tax-like proportional
 *    splits (e.g. PAYE band apportionment, VAT line splitting) to avoid the
 *    systematic upward bias HALF_UP introduces across many repeated splits.
 *  - allocate() below always preserves the exact original sum via the
 *    largest-remainder method regardless of rounding mode, which is the
 *    correct algorithm for splitting one amount across N parts (invoice
 *    line proration, cost-center allocation) — see Fowler, "Money" pattern.
 */

export enum RoundingMode {
  HALF_UP = "HALF_UP",
  HALF_EVEN = "HALF_EVEN",
}

const SCALE = 4;
const SCALE_FACTOR = 10n ** BigInt(SCALE);
const RATE_SCALE = 6;
const RATE_SCALE_FACTOR = 10n ** BigInt(RATE_SCALE);

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;

function parseDecimalToScaled(input: string, scale: number): bigint {
  const trimmed = input.trim();
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) {
    throw new RangeError(`Invalid decimal string for Money: "${input}"`);
  }
  const [, sign, intPart, fracPartRaw = ""] = match;
  const scaleFactor = 10n ** BigInt(scale);

  let fracDigits = fracPartRaw;
  let roundUp = false;
  if (fracDigits.length > scale) {
    const keep = fracDigits.slice(0, scale);
    const nextDigit = fracDigits.charCodeAt(scale) - 48;
    roundUp = nextDigit >= 5;
    fracDigits = keep;
  } else {
    fracDigits = fracDigits.padEnd(scale, "0");
  }

  let magnitude = BigInt(intPart) * scaleFactor + (fracDigits ? BigInt(fracDigits) : 0n);
  if (roundUp) {
    magnitude += 1n;
  }
  return sign === "-" && magnitude !== 0n ? -magnitude : magnitude;
}

function divideWithRounding(numerator: bigint, divisor: bigint, mode: RoundingMode): bigint {
  if (divisor === 0n) {
    throw new RangeError("Division by zero in Money arithmetic");
  }
  const negative = (numerator < 0n) !== (divisor < 0n);
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDivisor = divisor < 0n ? -divisor : divisor;

  const quotient = absNumerator / absDivisor;
  const remainder = absNumerator % absDivisor;
  const twiceRemainder = remainder * 2n;

  let roundedAbs = quotient;
  if (twiceRemainder > absDivisor) {
    roundedAbs += 1n;
  } else if (twiceRemainder === absDivisor) {
    if (mode === RoundingMode.HALF_UP) {
      roundedAbs += 1n;
    } else if (mode === RoundingMode.HALF_EVEN && quotient % 2n === 1n) {
      roundedAbs += 1n;
    }
  }

  return negative && roundedAbs !== 0n ? -roundedAbs : roundedAbs;
}

export class Money {
  static readonly SCALE = SCALE;
  static readonly ZERO: Money = new Money(0n);

  private constructor(private readonly scaled: bigint) {}

  static fromDecimalString(input: string): Money {
    return new Money(parseDecimalToScaled(input, SCALE));
  }

  static fromInt(units: number | bigint): Money {
    const asBigInt = typeof units === "bigint" ? units : BigInt(Math.trunc(units));
    return new Money(asBigInt * SCALE_FACTOR);
  }

  /** Constructs from an already-scaled bigint (raw internal representation). Use sparingly. */
  static fromScaled(scaled: bigint): Money {
    return new Money(scaled);
  }

  add(other: Money): Money {
    return new Money(this.scaled + other.scaled);
  }

  subtract(other: Money): Money {
    return new Money(this.scaled - other.scaled);
  }

  negate(): Money {
    return new Money(-this.scaled);
  }

  /**
   * Multiplies by a decimal rate/factor (e.g. a tax rate at NUMERIC(9,6)
   * precision). Rounds the product back to Money's 4-decimal scale using
   * the given rounding mode (default HALF_UP; pass HALF_EVEN for tax-style
   * proportional splitting — see class-level rounding matrix note).
   */
  multiply(factor: string | number, mode: RoundingMode = RoundingMode.HALF_UP): Money {
    const factorStr = typeof factor === "number" ? factor.toString() : factor;
    const factorScaled = parseDecimalToScaled(factorStr, RATE_SCALE);
    const product = this.scaled * factorScaled;
    const rounded = divideWithRounding(product, RATE_SCALE_FACTOR, mode);
    return new Money(rounded);
  }

  /**
   * Splits this amount into ratios.length parts proportional to `ratios`,
   * guaranteeing the parts sum to exactly this amount (no rounding leakage)
   * via the largest-remainder method. `ratios` are non-negative weights,
   * not required to sum to 1 or to any particular total.
   */
  allocate(ratios: readonly number[]): Money[] {
    if (ratios.length === 0) {
      throw new RangeError("Money.allocate requires at least one ratio");
    }
    if (ratios.some((r) => !Number.isFinite(r) || r < 0)) {
      throw new RangeError("Money.allocate ratios must be non-negative finite numbers");
    }
    const ratioSum = ratios.reduce((sum, r) => sum + r, 0);
    if (ratioSum === 0) {
      throw new RangeError("Money.allocate ratios must sum to more than zero");
    }

    const negative = this.scaled < 0n;
    const totalAbs = negative ? -this.scaled : this.scaled;

    const weightScale = 1_000_000n;
    const scaledRatios = ratios.map((r) => BigInt(Math.round(r * 1_000_000)));
    const scaledRatioSum = scaledRatios.reduce((sum, r) => sum + r, 0n);

    const shares: bigint[] = new Array(ratios.length).fill(0n);
    const remainders: { index: number; remainder: bigint }[] = [];
    let allocatedAbs = 0n;

    for (let i = 0; i < scaledRatios.length; i++) {
      const numerator = totalAbs * scaledRatios[i];
      const share = numerator / scaledRatioSum;
      const remainder = numerator % scaledRatioSum;
      shares[i] = share;
      allocatedAbs += share;
      remainders.push({ index: i, remainder });
    }

    let leftover = totalAbs - allocatedAbs;
    remainders.sort((a, b) => {
      if (a.remainder === b.remainder) return a.index - b.index;
      return a.remainder > b.remainder ? -1 : 1;
    });

    let cursor = 0;
    while (leftover > 0n && cursor < remainders.length) {
      shares[remainders[cursor].index] += 1n;
      leftover -= 1n;
      cursor++;
    }
    void weightScale;

    return shares.map((s) => new Money(negative ? -s : s));
  }

  compare(other: Money): -1 | 0 | 1 {
    if (this.scaled < other.scaled) return -1;
    if (this.scaled > other.scaled) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return this.scaled === other.scaled;
  }

  isZero(): boolean {
    return this.scaled === 0n;
  }

  isPositive(): boolean {
    return this.scaled > 0n;
  }

  isNegative(): boolean {
    return this.scaled < 0n;
  }

  /** Raw scaled bigint (value * 10^SCALE). For persistence/transformer use only. */
  toScaled(): bigint {
    return this.scaled;
  }

  toDecimalString(): string {
    const negative = this.scaled < 0n;
    const abs = negative ? -this.scaled : this.scaled;
    const intPart = abs / SCALE_FACTOR;
    const fracPart = abs % SCALE_FACTOR;
    const fracStr = fracPart.toString().padStart(SCALE, "0");
    return `${negative ? "-" : ""}${intPart.toString()}.${fracStr}`;
  }

  toString(): string {
    return this.toDecimalString();
  }

  toJSON(): string {
    return this.toDecimalString();
  }
}
