export type Assumptions = {
  cash: number;
  revenue: number;
  monthlyGrowth: number;
  variableCost: number;
  fixedCost: number;
  costInflation: number;
  workingCapital: number;
  oneTimeSpend: number;
  months: number;
  fxExposure: number;
  fxShock: number;
  volatility: number;
};
export const example: Assumptions = {
  cash: 120000, revenue: 32000, monthlyGrowth: 3, variableCost: 38, fixedCost: 24000,
  costInflation: 0.5, workingCapital: 8, oneTimeSpend: 0, months: 12,
  fxExposure: 25, fxShock: 0, volatility: 8,
};
export type Month = { month: number; revenue: number; expenses: number; operating: number; cash: number };

export function forecast(a: Assumptions, growthStress = 0, fixedStress = 0): Month[] {
  const rows: Month[] = [{ month: 0, revenue: 0, expenses: 0, operating: 0, cash: a.cash - a.oneTimeSpend }];
  const growth = Math.max(-95, a.monthlyGrowth + growthStress) / 100;
  const factor = 1 + (a.fxExposure / 100) * (a.fxShock / 100);
  let priorRevenue = a.revenue;
  for (let month = 1; month <= a.months; month++) {
    const revenue = a.revenue * (1 + growth) ** (month - 1);
    const fixed = a.fixedCost * (1 + fixedStress / 100) * (1 + a.costInflation / 100) ** (month - 1);
    const expenses = (fixed + revenue * a.variableCost / 100) * factor;
    const operating = revenue - expenses;
    const cash = rows[month - 1].cash + operating - (revenue - priorRevenue) * a.workingCapital / 100;
    rows.push({ month, revenue, expenses, operating, cash });
    priorRevenue = revenue;
  }
  return rows;
}

export function stats(rows: Month[]) {
  return {
    endCash: rows[rows.length - 1].cash,
    lowCash: Math.min(...rows.map((row) => row.cash)),
    runway: rows.find((row) => row.cash <= 0)?.month ?? null,
    firstProfit: rows.find((row) => row.month > 0 && row.operating >= 0)?.month ?? null,
  };
}

export function risk(a: Assumptions) {
  let seed = 82731;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return (seed + 1) / 4294967297;
  };
  const runs = Array.from({ length: 400 }, () => {
    const shock = Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
    const costShock = (random() + random() - 1) * a.volatility;
    return stats(forecast(a, shock * a.volatility / 3, costShock));
  });
  const cash = runs.map((run) => run.endCash).sort((left, right) => left - right);
  return {
    risk: runs.filter((run) => run.runway !== null).length / runs.length,
    p10: cash[39], p50: cash[199], p90: cash[359],
  };
}

export function actions(a: Assumptions) {
  const base = stats(forecast(a));
  const options = [
    { name: 'Reduce recurring overhead by 10%', next: 'Review vendor renewals and discretionary spend. Assign savings targets before committing.', inputs: { ...a, fixedCost: a.fixedCost * 0.9 } },
    { name: 'Improve monthly revenue growth by 2 points', next: 'Pick one acquisition or retention experiment. Establish a four-week cohort and review conversion weekly.', inputs: { ...a, monthlyGrowth: a.monthlyGrowth + 2 } },
    { name: 'Improve contribution margin by 5 points', next: 'Compare fulfilment costs and margin by product. Pilot pricing or supplier changes on one segment.', inputs: { ...a, variableCost: Math.max(0, a.variableCost - 5) } },
    { name: 'Release half the growth-related working capital', next: 'Review collections, inventory terms, and prepayment options. Track days to collect each week.', inputs: { ...a, workingCapital: a.workingCapital / 2 } },
  ];
  return options.map((option) => ({
    ...option, cashGain: stats(forecast(option.inputs)).endCash - base.endCash,
  })).sort((left, right) => right.cashGain - left.cashGain);
}
