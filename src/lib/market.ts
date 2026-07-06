import type { TradeType } from "../generated/prisma/enums.ts";

export const setDefaultShares = () => {
  return [
    { asset_id: "1", quantity: 0 },
    { asset_id: "2", quantity: 0 },
  ];
};

export const cost = (
  sharesQuantityList: Array<{ asset_id: string; quantity: number }>,
  b: number = 10,
) => {
  // sharesMap format:
  // { id: "id-for-yes-option", quantity: 100 }, { id: "id-for-no-option", quantity: 50 },
  let sumShares = 0;
  let shares = !sharesQuantityList.length
    ? setDefaultShares()
    : sharesQuantityList;
  shares.forEach(({ quantity }) => {
    sumShares += Math.exp(quantity / b);
  });

  return b * Math.log(sumShares);
};

export const prices = (
  sharesQuantityList: Array<{ asset_id: string; quantity: number }>,
  b: number = 10,
) => {
  // sharesMap format:
  // { id: "id-for-yes-option", quantity: 100 }, { id: "id-for-no-option", quantity: 50 },
  let sumSharesMap: Record<string, number> = {};
  let denom: number = 0;
  let shares =
    !sharesQuantityList.length ? setDefaultShares() : sharesQuantityList;

  shares.forEach(({ asset_id, quantity }) => {
    const expValue = Math.exp(quantity / b);
    sumSharesMap[asset_id] = expValue;
    denom += expValue;
  });

  Object.keys(sumSharesMap).forEach((key) => {
    sumSharesMap[key] = sumSharesMap[key] / denom;
  });

  return sumSharesMap;
};

export const executeTrade = (
  state: {
    trades: Array<{ asset_id: string; quantity: number }>;
    balance: number;
  },
  optionId: string,
  quantity: number,
  type: TradeType,
  b: number = 10,
) => {
  const { trades, balance } = state;
  const oldCost = cost(trades, b);
  let shareIndex = trades.findIndex((value) => value.asset_id === optionId);

  if (shareIndex < 0) {
    console.log("yes");
    shareIndex =
      trades.push({
        asset_id: optionId,
        quantity: 0,
      }) - 1;
  }

  if (type === "SELL" && trades[shareIndex].quantity - quantity < 0) {
    throw new Error("Cannot sell any more shares");
  }

  console.log(shareIndex, quantity, trades[shareIndex].quantity);

  trades[shareIndex].quantity += quantity * (type === "BUY" ? 1 : -1);

  const newCost = cost(trades, b);
  const payment = newCost - oldCost; // trader pays this
  console.log(oldCost, newCost, 'oldCost, newCost');
  console.log(trades);

  return {
    balance: balance + payment,
    trade: {
      option_id: optionId,
      quantity,
      avgPrice: payment / quantity,
      type,
      payment,
    },
    prices: prices(trades, b),
  };
};

export const recalculateBalance = (
  existingShares: Array<{ asset_id: string; quantity: number }>,
  b: number = 10,
) => {
  let balance = 0;
  let rebuiltState: typeof existingShares = [];

  existingShares.forEach((share) => {
    const oldCost = cost(rebuiltState, b);
    rebuiltState.push(structuredClone(share));
    const newCost = cost(rebuiltState, b);

    balance += newCost - oldCost;
  });

  return balance;
};
