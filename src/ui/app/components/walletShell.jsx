import React from 'react';
import { Outlet } from 'react-router-dom';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { getDelegation, setNetwork, onAccountChange } from '../../../api/extension';
import { NODE } from '../../../config/config';
import WalletTrays from './walletTrays';

/**
 * Shell for wallet-home secondary screens: keeps lower trays mounted while
 * navigating between /wallet, /accounts, /settings, /staking, /governance.
 */
const WalletShell = () => {
  const settings = useStoreState((state) => state.settings.settings);
  const setSettings = useStoreActions(
    (actions) => actions.settings.setSettings
  );
  const [delegation, setDelegation] = React.useState(null);
  const [isNetworkLoading, setIsNetworkLoading] = React.useState(false);

  const networkId = settings.network?.id;

  const refreshDelegation = React.useCallback(async () => {
    try {
      const next = await getDelegation();
      setDelegation(next);
    } catch (e) {
      console.warn('WalletShell: failed to load delegation', e);
      setDelegation(null);
    }
  }, []);

  React.useEffect(() => {
    refreshDelegation();
    const handler = onAccountChange(() => refreshDelegation());
    return () => handler && handler.remove();
  }, [networkId, refreshDelegation]);

  const onNetworkSelect = async (nextId) => {
    if (!nextId || nextId === networkId) return;
    setIsNetworkLoading(true);
    try {
      const nextNetwork = {
        ...settings.network,
        id: nextId,
        node: NODE[nextId],
      };
      await setNetwork(nextNetwork);
      setSettings({
        ...settings,
        network: nextNetwork,
      });
    } catch (e) {
      console.error('WalletShell: network switch failed', e);
    } finally {
      setIsNetworkLoading(false);
    }
  };

  return (
    <>
      {/* Remount page content when network changes so balances/history reload cleanly */}
      <Outlet key={networkId || 'network'} />
      <WalletTrays
        networkId={networkId}
        onNetworkSelect={onNetworkSelect}
        isNetworkLoading={isNetworkLoading}
        delegation={delegation}
        swapTrays={Boolean(settings.swapTrays)}
      />
    </>
  );
};

export default WalletShell;
