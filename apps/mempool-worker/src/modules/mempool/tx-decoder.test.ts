import { describe, expect, it } from 'vitest';

import { decodePendingSwapTransaction, resolvePoolImpactsFromDecodedSwap } from './tx-decoder';

const padHex = (value: string, bytes = 32) => value.replace(/^0x/, '').padStart(bytes * 2, '0');
const encodeUint = (value: bigint) => padHex(value.toString(16));
const encodeAddress = (value: string) => padHex(value.toLowerCase().replace(/^0x/, ''), 32);

const encodeAddressArray = (addresses: string[]) => {
  const head = encodeUint(BigInt(addresses.length));
  const tail = addresses.map((address) => encodeAddress(address)).join('');
  return `${head}${tail}`;
};

const buildV2SwapExactTokensForTokens = ({
  amountIn,
  amountOutMin,
  path,
  recipient,
  deadline,
}: {
  amountIn: bigint;
  amountOutMin: bigint;
  path: string[];
  recipient: string;
  deadline: bigint;
}) => {
  const selector = '38ed1739';
  const headWords = [
    encodeUint(amountIn),
    encodeUint(amountOutMin),
    encodeUint(160n),
    encodeAddress(recipient),
    encodeUint(deadline),
  ].join('');

  return `0x${selector}${headWords}${encodeAddressArray(path)}`;
};

const buildV2SwapExactETHForTokens = ({
  amountOutMin,
  path,
  recipient,
  deadline,
}: {
  amountOutMin: bigint;
  path: string[];
  recipient: string;
  deadline: bigint;
}) => {
  const selector = '7ff36ab5';
  const headWords = [
    encodeUint(amountOutMin),
    encodeUint(128n),
    encodeAddress(recipient),
    encodeUint(deadline),
  ].join('');

  return `0x${selector}${headWords}${encodeAddressArray(path)}`;
};

const buildV2SwapExactTokensForETH = ({
  amountIn,
  amountOutMin,
  path,
  recipient,
  deadline,
}: {
  amountIn: bigint;
  amountOutMin: bigint;
  path: string[];
  recipient: string;
  deadline: bigint;
}) => {
  const selector = '18cbafe5';
  const headWords = [
    encodeUint(amountIn),
    encodeUint(amountOutMin),
    encodeUint(160n),
    encodeAddress(recipient),
    encodeUint(deadline),
  ].join('');

  return `0x${selector}${headWords}${encodeAddressArray(path)}`;
};

const buildV2SwapTokensForExactTokens = ({
  amountOut,
  amountInMax,
  path,
  recipient,
  deadline,
}: {
  amountOut: bigint;
  amountInMax: bigint;
  path: string[];
  recipient: string;
  deadline: bigint;
}) => {
  const selector = '8803dbee';
  const headWords = [
    encodeUint(amountOut),
    encodeUint(amountInMax),
    encodeUint(160n),
    encodeAddress(recipient),
    encodeUint(deadline),
  ].join('');

  return `0x${selector}${headWords}${encodeAddressArray(path)}`;
};

const encodeBytes = (hex: string) => {
  const value = hex.replace(/^0x/, '');
  const lengthWord = encodeUint(BigInt(value.length / 2));
  const paddedLength = Math.ceil(value.length / 64) * 64;
  return `${lengthWord}${value.padEnd(paddedLength, '0')}`;
};

const encodeBytesArray = (items: string[]) => {
  const offsets: string[] = [];
  const bodies = items.map((item) => encodeBytes(item));
  let offset = 32 + items.length * 32;

  for (const body of bodies) {
    offsets.push(encodeUint(BigInt(offset)));
    offset += body.length / 2;
  }

  return `${encodeUint(BigInt(items.length))}${offsets.join('')}${bodies.join('')}`;
};

const buildV3ExactInputSingle = ({
  tokenIn,
  tokenOut,
  fee,
  amountIn,
  amountOutMin,
}: {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  amountIn: bigint;
  amountOutMin: bigint;
}) => {
  const selector = '04e45aaf';
  const params = [
    encodeAddress(tokenIn),
    encodeAddress(tokenOut),
    encodeUint(BigInt(fee)),
    encodeAddress('0x00000000000000000000000000000000000000aa'),
    encodeUint(1_700_000_000n),
    encodeUint(amountIn),
    encodeUint(amountOutMin),
    encodeUint(0n),
  ].join('');

  return `0x${selector}${params}`;
};

const buildV3Path = (addresses: string[], fees: number[]) => {
  let encoded = addresses[0]!.replace(/^0x/, '').toLowerCase();

  for (let index = 0; index < fees.length; index += 1) {
    encoded += fees[index]!.toString(16).padStart(6, '0');
    encoded += addresses[index + 1]!.replace(/^0x/, '').toLowerCase();
  }

  return `0x${encoded}`;
};

const buildV3ExactInput = ({
  path,
  amountIn,
  amountOutMin,
}: {
  path: string;
  amountIn: bigint;
  amountOutMin: bigint;
}) => {
  const selector = 'b858183f';
  const encodedPath = path.replace(/^0x/, '');
  const pathTailLength = Math.ceil(encodedPath.length / 64) * 64;
  const pathBody = `${encodeUint(BigInt(encodedPath.length / 2))}${encodedPath.padEnd(pathTailLength, '0')}`;
  const head = [
    encodeUint(160n),
    encodeAddress('0x00000000000000000000000000000000000000bb'),
    encodeUint(1_700_000_000n),
    encodeUint(amountIn),
    encodeUint(amountOutMin),
  ].join('');

  return `0x${selector}${head}${pathBody}`;
};

const buildV3ExactOutputSingle = ({
  tokenIn,
  tokenOut,
  fee,
  amountOut,
  amountInMaximum,
}: {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  amountOut: bigint;
  amountInMaximum: bigint;
}) => {
  const selector = '5023b4df';
  const params = [
    encodeAddress(tokenIn),
    encodeAddress(tokenOut),
    encodeUint(BigInt(fee)),
    encodeAddress('0x00000000000000000000000000000000000000aa'),
    encodeUint(1_700_000_000n),
    encodeUint(amountOut),
    encodeUint(amountInMaximum),
    encodeUint(0n),
  ].join('');
  return `0x${selector}${params}`;
};

const buildUniversalRouterExecute = (commandsHex: string, inputs: string[]) => {
  const selector = '3593564c';
  const commands = commandsHex.replace(/^0x/, '');
  const commandsPadded = Math.ceil(commands.length / 64) * 64;
  const commandsBody = `${encodeUint(BigInt(commands.length / 2))}${commands.padEnd(commandsPadded, '0')}`;
  const inputsBody = encodeBytesArray(inputs);
  const commandsOffset = 96n;
  const inputsOffset = commandsOffset + BigInt(commandsBody.length / 2);
  const head = `${encodeUint(commandsOffset)}${encodeUint(inputsOffset)}${encodeUint(1_700_000_000n)}`;
  return `0x${selector}${head}${commandsBody}${inputsBody}`;
};

const buildCurveExchange = ({ i, j, dx, minDy }: { i: bigint; j: bigint; dx: bigint; minDy: bigint }) => {
  const selector = 'a6417ed6';
  return `0x${selector}${encodeUint(i)}${encodeUint(j)}${encodeUint(dx)}${encodeUint(minDy)}`;
};

const buildCurveExchangeUnderlying = ({ i, j, dx, minDy }: { i: bigint; j: bigint; dx: bigint; minDy: bigint }) => {
  const selector = '394747c5';
  return `0x${selector}${encodeUint(i)}${encodeUint(j)}${encodeUint(dx)}${encodeUint(minDy)}`;
};

const buildBalancerSwap = ({ amount, assetIn, assetOut }: { amount: bigint; assetIn: string; assetOut: string }) => {
  const selector = '52bbbe29';
  const singleSwapOffset = 128n;
  const fundsOffset = 320n;
  const head = `${encodeUint(singleSwapOffset)}${encodeUint(fundsOffset)}${encodeUint(amount)}${encodeUint(1_700_000_000n)}`;
  const singleSwap = `${padHex('01', 32)}${encodeUint(0n)}${encodeAddress(assetIn)}${encodeAddress(assetOut)}${amount > 0n ? encodeUint(amount) : encodeUint(0n)}${encodeUint(0n)}`;
  const funds = `${encodeAddress('0x00000000000000000000000000000000000000aa')}${padHex('0', 32)}${encodeAddress('0x00000000000000000000000000000000000000bb')}${padHex('0', 32)}`;
  return `0x${selector}${head}${singleSwap}${funds}`;
};

const buildBalancerBatchSwap = ({ amount, assetIn, assetOut }: { amount: bigint; assetIn: string; assetOut: string }) => {
  const selector = '945bcec9';
  const swapsOffset = 192n;
  const assetsOffset = 416n;
  const fundsOffset = 640n;
  const limitsOffset = 768n;
  const head = `${encodeUint(0n)}${encodeUint(swapsOffset)}${encodeUint(assetsOffset)}${encodeUint(fundsOffset)}${encodeUint(limitsOffset)}${encodeUint(1_700_000_000n)}`;
  const swaps = `${encodeUint(1n)}${encodeUint(0n)}${encodeUint(0n)}${encodeUint(1n)}${encodeUint(amount)}${encodeUint(0n)}`;
  const assets = `${encodeUint(2n)}${encodeAddress(assetIn)}${encodeAddress(assetOut)}`;
  const funds = `${encodeAddress('0x00000000000000000000000000000000000000aa')}${padHex('0', 32)}${encodeAddress('0x00000000000000000000000000000000000000bb')}${padHex('0', 32)}`;
  const limits = `${encodeUint(2n)}${encodeUint(amount)}${encodeUint(0n)}`;
  return `0x${selector}${head}${swaps}${assets}${funds}${limits}`;
};

const buildV2SwapETHForExactTokens = ({
  amountOut,
  path,
  recipient,
  deadline,
}: {
  amountOut: bigint;
  path: string[];
  recipient: string;
  deadline: bigint;
}) => {
  const selector = 'fb3bdb41';
  const headWords = [
    encodeUint(amountOut),
    encodeUint(128n),
    encodeAddress(recipient),
    encodeUint(deadline),
  ].join('');
  return `0x${selector}${headWords}${encodeAddressArray(path)}`;
};

const buildV3ExactOutput = ({
  path,
  amountOut,
  amountInMaximum,
}: {
  path: string;
  amountOut: bigint;
  amountInMaximum: bigint;
}) => {
  const selector = '09b81346';
  const encodedPath = path.replace(/^0x/, '');
  const pathTailLength = Math.ceil(encodedPath.length / 64) * 64;
  const pathBody = `${encodeUint(BigInt(encodedPath.length / 2))}${encodedPath.padEnd(pathTailLength, '0')}`;
  const head = [
    encodeUint(160n),
    encodeAddress('0x00000000000000000000000000000000000000bb'),
    encodeUint(1_700_000_000n),
    encodeUint(amountOut),
    encodeUint(amountInMaximum),
  ].join('');
  return `0x${selector}${head}${pathBody}`;
};

const buildV3Multicall = (calls: string[]) => {
  const selector = 'ac9650d8';
  return `0x${selector}${encodeUint(32n)}${encodeBytesArray(calls)}`;
};

describe('decodePendingSwapTransaction', () => {
  it('decodes a pending Uniswap V2 swap intent', () => {
    const tx = {
      hash: '0xv2',
      from: '0x0000000000000000000000000000000000000abc',
      to: '0x0000000000000000000000000000000000000def',
      data: buildV2SwapExactTokensForTokens({
        amountIn: 1_000n,
        amountOutMin: 950n,
        path: [
          '0x0000000000000000000000000000000000000001',
          '0x0000000000000000000000000000000000000002',
        ],
        recipient: '0x0000000000000000000000000000000000000003',
        deadline: 1_700_000_000n,
      }),
      gasPrice: 30n,
      value: 0n,
      nonce: 7,
      firstSeenAt: 1_000,
    };

    const decoded = decodePendingSwapTransaction(tx, { now: 2_000, currentBaseFeePerGas: 10n });

    expect(decoded).toMatchObject({
      txHash: '0xv2',
      dex: 'uniswap_v2',
      method: 'swapExactTokensForTokens',
      amountSpecified: 1_000n,
      swaps: [
        {
          tokenIn: '0x0000000000000000000000000000000000000001',
          tokenOut: '0x0000000000000000000000000000000000000002',
          amountIn: 1_000n,
          amountOutMin: 950n,
        },
      ],
    });
  });

  it('decodes a pending V3 multicall exactInputSingle intent', () => {
    const tx = {
      hash: '0xv3',
      from: '0x0000000000000000000000000000000000000abc',
      to: '0x0000000000000000000000000000000000000fed',
      data: buildV3Multicall([
        buildV3ExactInputSingle({
          tokenIn: '0x0000000000000000000000000000000000000010',
          tokenOut: '0x0000000000000000000000000000000000000020',
          fee: 500,
          amountIn: 2_500n,
          amountOutMin: 2_450n,
        }),
      ]),
      gasPrice: 50n,
      value: 0n,
      nonce: 8,
      firstSeenAt: 1_000,
    };

    const decoded = decodePendingSwapTransaction(tx, { now: 2_000, currentBaseFeePerGas: 10n });

    expect(decoded).toMatchObject({
      txHash: '0xv3',
      dex: 'uniswap_v3',
      method: 'multicall',
      amountSpecified: 2_500n,
      swaps: [
        {
          tokenIn: '0x0000000000000000000000000000000000000010',
          tokenOut: '0x0000000000000000000000000000000000000020',
          amountIn: 2_500n,
          amountOutMin: 2_450n,
          fee: 500,
        },
      ],
    });
  });

  it('decodes V2 exact ETH/token router forms', () => {
    const ethIn = decodePendingSwapTransaction({
      hash: '0xeth-in',
      from: '0x0000000000000000000000000000000000000abc',
      to: '0x0000000000000000000000000000000000000def',
      data: buildV2SwapExactETHForTokens({
        amountOutMin: 900n,
        path: ['0x00000000000000000000000000000000000000ee', '0x00000000000000000000000000000000000000ff'],
        recipient: '0x0000000000000000000000000000000000000003',
        deadline: 1_700_000_000n,
      }),
      gasPrice: 40n,
      value: 1_234n,
      nonce: 1,
      firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });

    const tokenToEth = decodePendingSwapTransaction({
      hash: '0xtoken-out',
      from: '0x0000000000000000000000000000000000000abc',
      to: '0x0000000000000000000000000000000000000def',
      data: buildV2SwapExactTokensForETH({
        amountIn: 2_000n,
        amountOutMin: 700n,
        path: ['0x00000000000000000000000000000000000000ff', '0x00000000000000000000000000000000000000ee'],
        recipient: '0x0000000000000000000000000000000000000003',
        deadline: 1_700_000_000n,
      }),
      gasPrice: 40n,
      value: 0n,
      nonce: 2,
      firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });

    expect(ethIn).toMatchObject({
      method: 'swapExactETHForTokens',
      amountSpecified: 1_234n,
      swaps: [{ tokenIn: '0x00000000000000000000000000000000000000ee', tokenOut: '0x00000000000000000000000000000000000000ff', amountIn: 1_234n }],
    });
    expect(tokenToEth).toMatchObject({
      method: 'swapExactTokensForETH',
      amountSpecified: 2_000n,
      swaps: [{ tokenIn: '0x00000000000000000000000000000000000000ff', tokenOut: '0x00000000000000000000000000000000000000ee', amountIn: 2_000n }],
    });
  });

  it('decodes V3 multicall exactInput packed path into hop swaps', () => {
    const tx = {
      hash: '0xv3-path',
      from: '0x0000000000000000000000000000000000000abc',
      to: '0x0000000000000000000000000000000000000fed',
      data: buildV3Multicall([
        buildV3ExactInput({
          path: buildV3Path([
            '0x0000000000000000000000000000000000000010',
            '0x0000000000000000000000000000000000000020',
            '0x0000000000000000000000000000000000000030',
          ], [500, 3000]),
          amountIn: 3_000n,
          amountOutMin: 2_800n,
        }),
      ]),
      gasPrice: 50n,
      value: 0n,
      nonce: 8,
      firstSeenAt: 1_000,
    };

    const decoded = decodePendingSwapTransaction(tx, { now: 2_000, currentBaseFeePerGas: 10n });

    expect(decoded).toMatchObject({
      txHash: '0xv3-path',
      dex: 'uniswap_v3',
      method: 'multicall',
      amountSpecified: 3_000n,
    });
    expect(decoded?.swaps).toEqual([
      {
        tokenIn: '0x0000000000000000000000000000000000000010',
        tokenOut: '0x0000000000000000000000000000000000000020',
        amountIn: 3_000n,
        amountOutMin: 2_800n,
        fee: 500,
      },
      {
        tokenIn: '0x0000000000000000000000000000000000000020',
        tokenOut: '0x0000000000000000000000000000000000000030',
        amountIn: 0n,
        amountOutMin: 2_800n,
        fee: 3000,
      },
    ]);
  });

  it('resolves impacted pools from decoded swap hops with pool registry mapping', () => {
    const decoded = decodePendingSwapTransaction({
      hash: '0xresolve',
      from: '0x0000000000000000000000000000000000000abc',
      to: '0x0000000000000000000000000000000000000def',
      data: buildV2SwapExactTokensForTokens({
        amountIn: 1_000n,
        amountOutMin: 900n,
        path: [
          '0x0000000000000000000000000000000000000001',
          '0x0000000000000000000000000000000000000002',
        ],
        recipient: '0x0000000000000000000000000000000000000003',
        deadline: 1_700_000_000n,
      }),
      gasPrice: 30n,
      value: 0n,
      nonce: 7,
      firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });

    const impacts = resolvePoolImpactsFromDecodedSwap(decoded!, {
      chainId: 1,
      resolvePool: ({ tokenIn, tokenOut, dex }) => dex === 'uniswap-v2'
        && tokenIn === '0x0000000000000000000000000000000000000001'
        && tokenOut === '0x0000000000000000000000000000000000000002'
        ? { poolAddress: 'pool-1', dexType: 'uniswap-v2' }
        : null,
    });

    expect(impacts).toEqual([
      expect.objectContaining({
        txHash: '0xresolve',
        chainId: 1,
        poolAddress: 'pool-1',
        tokenIn: '0x0000000000000000000000000000000000000001',
        tokenOut: '0x0000000000000000000000000000000000000002',
      }),
    ]);
  });

  it('decodes important exact-output router forms for V2 and V3', () => {
    const v2 = decodePendingSwapTransaction({
      hash: '0xv2out',
      from: '0x0000000000000000000000000000000000000abc',
      to: '0x0000000000000000000000000000000000000def',
      data: buildV2SwapTokensForExactTokens({
        amountOut: 900n,
        amountInMax: 1_100n,
        path: ['0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002'],
        recipient: '0x0000000000000000000000000000000000000003',
        deadline: 1_700_000_000n,
      }),
      gasPrice: 33n,
      value: 0n,
      nonce: 9,
      firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });

    const v3 = decodePendingSwapTransaction({
      hash: '0xv3out',
      from: '0x0000000000000000000000000000000000000abc',
      to: '0x0000000000000000000000000000000000000fed',
      data: buildV3Multicall([
        buildV3ExactOutputSingle({
          tokenIn: '0x0000000000000000000000000000000000000010',
          tokenOut: '0x0000000000000000000000000000000000000020',
          fee: 500,
          amountOut: 2_000n,
          amountInMaximum: 2_200n,
        }),
      ]),
      gasPrice: 50n,
      value: 0n,
      nonce: 10,
      firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });

    expect(v2).toMatchObject({ method: 'swapTokensForExactTokens', amountSpecified: 1_100n });
    expect(v2?.swaps[0]).toMatchObject({ amountIn: 1_100n, amountOutMin: 900n });
    expect(v3).toMatchObject({ method: 'multicall', amountSpecified: 2_200n });
    expect(v3?.swaps[0]).toMatchObject({ amountIn: 2_200n, amountOutMin: 2_000n, fee: 500 });
  });

  it('partially decodes universal-router, curve, balancer, and aggregator intent markers', () => {
    const universal = decodePendingSwapTransaction({
      hash: '0xur', from: '0x0000000000000000000000000000000000000abc', to: '0x1',
      data: buildUniversalRouterExecute('00', [buildV3ExactInputSingle({ tokenIn: '0x0000000000000000000000000000000000000010', tokenOut: '0x0000000000000000000000000000000000000020', fee: 500, amountIn: 1_000n, amountOutMin: 900n })]),
      gasPrice: 40n, value: 0n, nonce: 11, firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });
    const curve = decodePendingSwapTransaction({
      hash: '0xcurve', from: '0x0000000000000000000000000000000000000abc', to: '0x2',
      data: buildCurveExchange({ i: 0n, j: 1n, dx: 5_000n, minDy: 4_900n }), gasPrice: 40n, value: 0n, nonce: 12, firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });
    const balancer = decodePendingSwapTransaction({
      hash: '0xbal', from: '0x0000000000000000000000000000000000000abc', to: '0x3',
      data: buildBalancerSwap({ amount: 6_000n, assetIn: '0x0000000000000000000000000000000000000001', assetOut: '0x0000000000000000000000000000000000000002' }), gasPrice: 40n, value: 0n, nonce: 13, firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });
    const aggregator = decodePendingSwapTransaction({
      hash: '0xagg', from: '0x0000000000000000000000000000000000000abc', to: '0x4',
      data: '0xd9627aa4', gasPrice: 40n, value: 0n, nonce: 14, firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });

    expect(universal).toMatchObject({ method: 'execute', dex: 'universal_router' });
    expect(curve).toMatchObject({ method: 'exchange', dex: 'curve' });
    expect(balancer).toMatchObject({ method: 'swap', dex: 'balancer' });
    expect(aggregator).toMatchObject({ method: 'sellToUniswap', dex: 'aggregator' });
  });

  it('decodes the remaining named router forms in normalized actionable shape', () => {
    const v2 = decodePendingSwapTransaction({
      hash: '0xv2ethExact', from: '0x0000000000000000000000000000000000000abc', to: '0x1',
      data: buildV2SwapETHForExactTokens({
        amountOut: 1_500n,
        path: ['0x00000000000000000000000000000000000000ee', '0x00000000000000000000000000000000000000ff'],
        recipient: '0x0000000000000000000000000000000000000003',
        deadline: 1_700_000_000n,
      }),
      gasPrice: 40n, value: 2_000n, nonce: 15, firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });
    const v3 = decodePendingSwapTransaction({
      hash: '0xv3exactOut', from: '0x0000000000000000000000000000000000000abc', to: '0x2',
      data: buildV3Multicall([
        buildV3ExactOutput({
          path: buildV3Path([
            '0x0000000000000000000000000000000000000030',
            '0x0000000000000000000000000000000000000020',
            '0x0000000000000000000000000000000000000010',
          ], [3000, 500]),
          amountOut: 2_500n,
          amountInMaximum: 2_800n,
        }),
      ]),
      gasPrice: 40n, value: 0n, nonce: 16, firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });
    const curveUnderlying = decodePendingSwapTransaction({
      hash: '0xcurveUnderlying', from: '0x0000000000000000000000000000000000000abc', to: '0x3',
      data: buildCurveExchangeUnderlying({ i: 0n, j: 1n, dx: 4_000n, minDy: 3_900n }), gasPrice: 40n, value: 0n, nonce: 17, firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });
    const balancerBatch = decodePendingSwapTransaction({
      hash: '0xbalBatch', from: '0x0000000000000000000000000000000000000abc', to: '0x4',
      data: buildBalancerBatchSwap({ amount: 7_000n, assetIn: '0x0000000000000000000000000000000000000001', assetOut: '0x0000000000000000000000000000000000000002' }), gasPrice: 40n, value: 0n, nonce: 18, firstSeenAt: 1_000,
    }, { now: 2_000, currentBaseFeePerGas: 10n });

    expect(v2).toMatchObject({ method: 'swapETHForExactTokens', amountSpecified: 2_000n });
    expect(v3).toMatchObject({ method: 'multicall', amountSpecified: 2_800n });
    expect(v3?.swaps).toHaveLength(2);
    expect(curveUnderlying).toMatchObject({ method: 'exchange_underlying', dex: 'curve' });
    expect(balancerBatch).toMatchObject({ method: 'batchSwap', dex: 'balancer' });
  });
});
