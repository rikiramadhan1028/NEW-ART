import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  mainnet,
  polygon,
  arbitrum,
  base,
  sepolia,
} from 'wagmi/chains';

const holesky = {
  id: 17000,
  name: 'Holesky',
  network: 'Holesky',
  nativeCurrency: {
    decimals: 18,
    name: 'ETH',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://ethereum-holesky-rpc.publicnode.com'] },
    public: { http: ['https://ethereum-holesky-rpc.publicnode.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://holesky.etherscan.io' },
  },
} as const;

export const wagmiConfig = getDefaultConfig({
  appName: 'NFT Generator',
  projectId: '9cb44046b2925c98cfb01d4e264562cf',
  chains: [
    mainnet,
    polygon,
    arbitrum,
    base,
    sepolia,
    holesky,
  ],
  ssr: false, // Vite tidak menggunakan SSR
});