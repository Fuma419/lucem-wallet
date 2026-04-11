import { koiosRequest } from './src/api/util';
import { getPoolMetadata } from './src/api/extension/index';

jest.mock('./src/api/extension', () => ({
  ...jest.requireActual('./src/api/extension/index'),
  getNetwork: jest.fn().mockResolvedValue({ id: 'mainnet' })
}));

test('koiosRequest', async () => {
  const result = await getPoolMetadata('pool1eaeynp2hs06v4x8q65jfm2xqcd3dc80rv220gmxvwg8m5sd6e7a');
  console.log(result);
});
