const exchanges = [
  ['nestex', 'NestEx', 'USDT'],
  ['gatevia', 'Gatevia', 'DOGE'],
  ['neoxex', 'NeoxEX', 'USDT'],
  ['filodex', 'FiloDex', 'USDT'],
  ['spotex', 'SpotEx', 'USDT']
];

function positive(value) {
  return Number.isFinite(value) && value > 0;
}

export function referenceBackfill(markets, exchange) {
  const rows = markets[exchange] || [];
  const otherExchange = exchange === 'yerb-reference-five' ? 'yerb-reference-four' : 'yerb-reference-five';
  const otherPrices = new Map((markets[otherExchange] || []).map(row => [row.timestamp, row.price]));
  const useSpotEx = exchange === 'yerb-reference-five';
  const quoteHistory = exchanges.map(([key, , quote]) =>
    new Map((markets[key] || []).filter(row => row.quote === quote).map(row => [row.timestamp, row.price])));

  return rows.map(row => {
    if (row.sources?.length || !positive(row.price)) return row;
    const otherPrice = otherPrices.get(row.timestamp);
    const prices = quoteHistory.map(history => history.get(row.timestamp));
    if (!positive(otherPrice) || !prices.every(positive)) return row;

    const [nestex, gatevia, neoxex, filodex, spotex] = prices;
    const directFour = nestex + neoxex + filodex;
    const gateviaFour = (useSpotEx ? otherPrice : row.price) * 4 - directFour;
    const gateviaFive = (useSpotEx ? row.price : otherPrice) * 5 - directFour - spotex;
    // Subtraction of the saved averages can introduce floating-point noise.
    const tolerance = 32 * Number.EPSILON * (directFour + spotex + Math.abs(gateviaFour));
    if (!positive(gateviaFour) || !positive(gateviaFive) || Math.abs(gateviaFour - gateviaFive) > tolerance) return row;
    const quoteUsdt = Number(((gateviaFour + gateviaFive) / (2 * gatevia)).toPrecision(15));

    const sources = exchanges.slice(0, useSpotEx ? 5 : 4).map(([key, exchangeName, nativeQuote], index) => {
      const nativeLast = prices[index];
      return key === 'gatevia'
        ? { exchange: key, exchangeName, nativeQuote, nativeLast, priceUsdt: nativeLast * quoteUsdt, quoteUsdt, reconstructed: true }
        : { exchange: key, exchangeName, nativeQuote, nativeLast, priceUsdt: nativeLast };
    });
    return { ...row, sources };
  });
}
