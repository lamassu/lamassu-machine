/*
 * Greedy solver of the coin change problem, based on the following CHICKEN
 * implementation: https://git.sr.ht/~siiky/coin-change
 */

/*
 * prepare_denominations([[d0, count], [d1, count], ...])
 * => [{ denom, count, csum }, ...]
 */
const prepare_denominations = denominations =>
  JSON.parse(JSON.stringify(denominations))
    .sort(([d1, c1], [d2, c2]) => d1 < d2)
    .reduce(
      ([csum, denoms], [denom, count]) => {
        csum += denom*count
        return [
          csum,
          [{ denom, count, csum }].concat(denoms)
        ]
      },
      [0, []]
    )[1] /* ([csum, denoms]) => denoms */

const max_denomination_multiplicity = (denom, count, target) =>
  Math.min(count, Math.floor(target / denom))

const has_divisor = (didx, denominations, target) =>
  denominations
    .slice(didx)
    .some(({ denom }) => (target % denom) === 0)

/*
 * @returns null if there's no solution set;
 *          false if there's no solution;
 *          solution if there's a solution
 */
const memo_get = (memo, target, denom) => {
  const denom_solutions = memo[target]
  if (denom_solutions === undefined) return null
  const solution = denom_solutions[denom]
  return solution === undefined ? null : solution
}

const memo_set = (memo, target, denom, solution) => {
  let denom_solutions = memo[target]
  if (denom_solutions === undefined)
    memo[target] = denom_solutions = {}
  return denom_solutions[denom] = solution
}

const check = (solution, target) =>
  !solution
  || target === solution.reduce((sum, [denom, provisioned]) => sum + denom*provisioned, 0)

const model = denominations => ({
  denominations: prepare_denominations(denominations),
  memo: {}
})

/*
 * target :: Int
 * denominations :: [[d0, count], [d1, count], ...]
 *
 * @returns [[d0, provisioned], [d1, provisioned], ... ];
 *          false if there's no solution.
 */
const solve = (model, target) => {
  const { denominations, memo } = model

  const coin_change = (didx, target) => {
    if (target === 0) return []

    for (; didx < denominations.length; didx++) {
      const { denom, count, csum } = denominations[didx]

      /*
       * There's no solution if the target is greater than the cumulative sum
       * of the denominations, or if the target is not divisible by any of the
       * denominations
       */
      if (target > csum || !has_divisor(didx, denominations, target))
        return memo_set(memo, target, denom, false)

      let solution = memo_get(memo, target, denom)
      if (solution === false) continue /* not here, keep looking */
      if (solution) return solution /* we've previously computed a solution */

      /* solution === null */
      for (let nd = max_denomination_multiplicity(denom, count, target); nd >= 0; nd--) {
        solution = coin_change(didx+1, target - denom*nd)
        if (solution)
          return memo_set(memo, target, denom, [[denom, nd]].concat(solution))
      }

      memo_set(memo, target, denom, false)
    }

    return false
  }

  return coin_change(0, target)
}

module.exports = {
  check,
  model,
  solve,
}
