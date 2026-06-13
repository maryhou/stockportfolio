import { describe, it, expect, vi, afterEach } from 'vitest';
import type { BuyTransaction, SellTransaction, DividendTransaction } from '../types';
import {
  calcSharesHeldAtDate,
  calcDividendHealthInsurance,
  calcDividendGross,
  calcDividendNet,
  calcTotalDividendNet,
  dividendStatDate,
  calcYearDividends,
  calcMonthDividends,
  calcMonthlyDividends,
  calcDividendYield,
  calcFee,
  calcTax,
  calcAvgCost,
  calcRemainingShares,
  calcTotalInvested,
  calcTotalRealizedProfit,
  calcExactRealizedProfit,
  calcTotalNetProceeds,
  buildSellTransaction,
  isETFSymbol,
  formatNTD,
  formatPrice,
  HEALTH_INSURANCE_THRESHOLD,
  ETF_TAX_RATE,
} from './calculations';

function buy(over: Partial<BuyTransaction> = {}): BuyTransaction {
  return { id: 'b1', date: '2026-01-01', price: 100, shares: 1000, fee: 85, ...over };
}

function sell(over: Partial<SellTransaction> = {}): SellTransaction {
  return {
    id: 's1', date: '2026-02-01', price: 110, shares: 1000,
    fee: 94, tax: 330, profit: 9491, netProceeds: 109576, ...over,
  };
}

function dividend(over: Partial<DividendTransaction> = {}): DividendTransaction {
  return {
    id: 'd1', date: '2026-03-20', exDate: '2026-03-01',
    amountPerShare: 1, shares: 1000, grossAmount: 1000,
    healthInsuranceFee: 0, transferFee: 10, netAmount: 990, ...over,
  };
}

describe('calcFee 手續費', () => {
  it('計算 0.1425% × 6 折，無條件捨去', () => {
    // 100,000 × 0.001425 × 0.6 = 85.5 → 85
    expect(calcFee(100, 1000)).toBe(85);
  });

  it('接受自訂費率與折扣', () => {
    // 100,000 × 0.001425 × 1.0 = 142.5 → 142
    expect(calcFee(100, 1000, 0.001425, 1)).toBe(142);
  });

  it('小額交易手續費可為 0（目前未實作最低 20 元）', () => {
    expect(calcFee(50, 10)).toBe(0);
  });
});

describe('calcTax 證交稅', () => {
  it('一般股票 0.3%，無條件進位', () => {
    expect(calcTax(100, 1000)).toBe(300);
    // 50 × 1 × 0.003 = 0.15 → 1
    expect(calcTax(50, 1)).toBe(1);
  });

  it('ETF 稅率 0.1%', () => {
    // 36.5 × 1000 × 0.001 = 36.5 → 37
    expect(calcTax(36.5, 1000, ETF_TAX_RATE)).toBe(37);
  });
});

describe('calcDividendHealthInsurance 健保補充費', () => {
  it('未達 20,000 不收', () => {
    expect(calcDividendHealthInsurance(19_999)).toBe(0);
  });

  it('達 20,000（含）收 2.11%，無條件捨去', () => {
    expect(calcDividendHealthInsurance(HEALTH_INSURANCE_THRESHOLD)).toBe(422); // 20,000 × 0.0211 = 422
    expect(calcDividendHealthInsurance(25_000)).toBe(527); // 527.5 → 527
  });
});

describe('股息金額計算', () => {
  it('calcDividendGross 四捨五入到元', () => {
    expect(calcDividendGross(0.85, 1234)).toBe(1049); // 1048.9
    expect(calcDividendGross(2.8, 500)).toBe(1400);
  });

  it('calcDividendNet 扣健保費與匯費，不為負', () => {
    expect(calcDividendNet(25_000, 527, 10)).toBe(24_463);
    expect(calcDividendNet(5, 0, 10)).toBe(0);
  });

  it('calcTotalDividendNet 加總 netAmount', () => {
    expect(calcTotalDividendNet([dividend({ netAmount: 990 }), dividend({ id: 'd2', netAmount: 1500 })])).toBe(2490);
  });
});

describe('dividendStatDate 統計歸屬日', () => {
  it('優先用除息日', () => {
    expect(dividendStatDate(dividend({ exDate: '2026-03-01', date: '2026-03-20' }))).toBe('2026-03-01');
  });

  it('舊資料缺除息日時退回發放日', () => {
    expect(dividendStatDate(dividend({ exDate: undefined, date: '2026-03-20' }))).toBe('2026-03-20');
  });
});

describe('股息年/月統計', () => {
  const list = [
    dividend({ id: 'a', exDate: '2025-12-15', date: '2026-01-10', netAmount: 100 }), // 歸屬 2025-12
    dividend({ id: 'b', exDate: '2026-01-05', date: '2026-01-25', netAmount: 200 }),
    dividend({ id: 'c', exDate: undefined, date: '2026-01-30', netAmount: 300 }),    // 退回發放日
    dividend({ id: 'd', exDate: '2026-03-01', date: '2026-03-20', netAmount: 400 }),
  ];

  it('calcYearDividends 以歸屬日篩年', () => {
    expect(calcYearDividends(list, '2025')).toBe(100);
    expect(calcYearDividends(list, '2026')).toBe(900);
  });

  it('calcMonthDividends 以歸屬日篩月', () => {
    expect(calcMonthDividends(list, '2026-01')).toBe(500);
    expect(calcMonthDividends(list, '2026-03')).toBe(400);
  });

  it('calcMonthlyDividends 回傳 12 個月陣列', () => {
    const monthly = calcMonthlyDividends(list, '2026');
    expect(monthly).toHaveLength(12);
    expect(monthly[0]).toBe(500);  // 一月
    expect(monthly[2]).toBe(400);  // 三月
    expect(monthly[5]).toBe(0);
  });
});

describe('calcDividendYield 年化殖利率', () => {
  afterEach(() => vi.useRealTimers());

  it('只計入過去 12 個月的股息', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T00:00:00Z'));
    const list = [
      dividend({ exDate: '2025-06-12', netAmount: 999 }),  // 超過 12 個月，不計
      dividend({ id: 'd2', exDate: '2025-06-13', netAmount: 600 }),
      dividend({ id: 'd3', exDate: '2026-01-01', netAmount: 400 }),
    ];
    expect(calcDividendYield(list, 20_000)).toBe(5); // 1,000 / 20,000 × 100
  });

  it('沒有投入或沒有股息時回傳 0', () => {
    expect(calcDividendYield([], 100_000)).toBe(0);
    expect(calcDividendYield([dividend()], 0)).toBe(0);
  });
});

describe('持股與成本', () => {
  it('calcSharesHeldAtDate 含當日交易、不為負', () => {
    const buys = [buy({ date: '2026-01-10', shares: 1000 })];
    const sells = [sell({ date: '2026-02-10', shares: 400 })];
    expect(calcSharesHeldAtDate(buys, sells, '2026-01-09')).toBe(0);
    expect(calcSharesHeldAtDate(buys, sells, '2026-01-10')).toBe(1000); // 買入當日計入
    expect(calcSharesHeldAtDate(buys, sells, '2026-02-10')).toBe(600);  // 賣出當日扣除
    expect(calcSharesHeldAtDate([], sells, '2026-03-01')).toBe(0);      // 不為負
  });

  it('calcAvgCost 含手續費的加權平均', () => {
    const buys = [
      buy({ price: 100, shares: 1000, fee: 85 }),
      buy({ id: 'b2', price: 110, shares: 1000, fee: 94 }),
    ];
    // (100,085 + 110,094) / 2,000 = 105.0895
    expect(calcAvgCost(buys)).toBeCloseTo(105.0895);
    expect(calcAvgCost([])).toBe(0);
  });

  it('calcRemainingShares / calcTotalInvested', () => {
    const buys = [buy({ shares: 1000, price: 100, fee: 85 })];
    const sells = [sell({ shares: 400 })];
    expect(calcRemainingShares(buys, sells)).toBe(600);
    expect(calcTotalInvested(buys)).toBe(100_085);
  });
});

describe('已實現損益', () => {
  it('calcTotalRealizedProfit / calcTotalNetProceeds 加總', () => {
    const sells = [sell({ profit: 9491, netProceeds: 109_576 }), sell({ id: 's2', profit: -500, netProceeds: 50_000 })];
    expect(calcTotalRealizedProfit(sells)).toBe(8991);
    expect(calcTotalNetProceeds(sells)).toBe(159_576);
  });

  it('calcExactRealizedProfit 全部出清時用整數差額', () => {
    const buys = [buy({ shares: 1000, price: 100, fee: 85 })];
    const sells = [sell({ shares: 1000, netProceeds: 109_576, profit: 9000 })]; // 故意給不準的 profit
    // 全出清 → 109,576 - 100,085 = 9,491（忽略儲存的 profit）
    expect(calcExactRealizedProfit(buys, sells)).toBe(9491);
  });

  it('calcExactRealizedProfit 部分出清時退回累計 profit', () => {
    const buys = [buy({ shares: 1000 })];
    const sells = [sell({ shares: 400, profit: 3000 })];
    expect(calcExactRealizedProfit(buys, sells)).toBe(3000);
  });
});

describe('buildSellTransaction 賣出試算', () => {
  it('預設費率：手續費捨去、稅進位、損益以含費均價計', () => {
    const tx = buildSellTransaction('s1', '2026-02-01', 110, 1000, 100.085);
    expect(tx.fee).toBe(94);   // 110,000 × 0.001425 × 0.6 = 94.05 → 94
    expect(tx.tax).toBe(330);  // 110,000 × 0.003
    expect(tx.netProceeds).toBe(109_576); // 110,000 - 94 - 330
    expect(tx.profit).toBeCloseTo(9491);  // 109,576 - 100,085
  });

  it('可帶入 ETF 稅率與券商折扣', () => {
    const tx = buildSellTransaction('s1', '2026-02-01', 36.5, 1000, 35, { taxRate: ETF_TAX_RATE, feeDiscount: 0.28 });
    expect(tx.fee).toBe(14);  // 36,500 × 0.001425 × 0.28 = 14.5635 → 14
    expect(tx.tax).toBe(37);  // 36,500 × 0.001 = 36.5 → 37
    expect(tx.netProceeds).toBe(36_449);
  });
});

describe('isETFSymbol', () => {
  it('0 開頭的數字代號視為 ETF', () => {
    expect(isETFSymbol('0050')).toBe(true);
    expect(isETFSymbol('006208')).toBe(true);
    expect(isETFSymbol('00878')).toBe(true);
    expect(isETFSymbol(' 0056 ')).toBe(true); // 容忍前後空白
  });

  it('一般股票代號不是 ETF', () => {
    expect(isETFSymbol('2330')).toBe(false);
    expect(isETFSymbol('2454')).toBe(false);
  });
});

describe('格式化', () => {
  it('formatNTD 整數新台幣含千分位', () => {
    expect(formatNTD(1_234_567)).toContain('1,234,567');
    expect(formatNTD(1_234_567)).toMatch(/^(NT)?\$/);
  });

  it('formatPrice 固定兩位小數', () => {
    expect(formatPrice(2310.5)).toBe('2,310.50');
    expect(formatPrice(36)).toBe('36.00');
  });
});
