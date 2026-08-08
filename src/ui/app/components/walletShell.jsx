import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useStoreState } from 'easy-peasy';
import {
  getDelegation,
  getAccounts,
  getCurrentAccountIndex,
  switchAccount,
  onAccountChange,
} from '../../../api/extension';
import WalletTrays from './walletTrays';

/**
 * Shell for wallet-home secondary screens: keeps lower trays mounted while
 * navigating between /wallet, /accounts, /settings, /staking, /governance.
 */
const WalletShell = () => {
  const settings = useStoreState((state) => state.settings.settings);
  const location = useLocation();
  const [delegation, setDelegation] = React.useState(null);
  const [accounts, setAccounts] = React.useState({});
  const [currentAccountIndex, setCurrentAccountIndex] = React.useState(null);

  const networkId = settings.network?.id;

  const refreshDelegation = React.useCallback(async () => {
    try {
      const next = await getDelegation();
      if (next) setDelegation(next);
    } catch (e) {
      // Keep the last known delegation so Vote/Stake tray actions do not
      // flicker away on transient API failures (e.g. during theme toggles /
      // remount-driven refreshes).
      console.warn('WalletShell: failed to load delegation', e);
    }
  }, []);

  // The account tray mirrors stored accounts, so it stays in sync as accounts
  // are added, removed, renamed, or re-avatared.
  const refreshAccounts = React.useCallback(async () => {
    try {
      const [all, index] = await Promise.all([
        getAccounts(),
        getCurrentAccountIndex(),
      ]);
      setAccounts(all || {});
      setCurrentAccountIndex(index);
    } catch (e) {
      console.warn('WalletShell: failed to load accounts', e);
    }
  }, []);

  React.useEffect(() => {
    refreshDelegation();
    refreshAccounts();
    const handler = onAccountChange(() => {
      refreshDelegation();
      refreshAccounts();
    });
    return () => handler && handler.remove();
  }, [networkId, refreshDelegation, refreshAccounts]);

  // Returning from /accounts (where accounts are added/removed/renamed) should
  // refresh the tray even when no account-change event fired.
  React.useEffect(() => {
    refreshAccounts();
  }, [location.pathname, refreshAccounts]);

  const onAccountSelect = async (nextIndex) => {
    if (nextIndex == null) return;
    try {
      await switchAccount(nextIndex);
      setCurrentAccountIndex(nextIndex);
      await refreshAccounts();
    } catch (e) {
      console.error('WalletShell: account switch failed', e);
    }
  };

  return (
    <>
      {/* Remount page content when the network or active account changes so
          balances/history reload cleanly for the new context. */}
      <Outlet
        key={`${networkId || 'network'}:${
          currentAccountIndex != null ? currentAccountIndex : 'account'
        }`}
      />
      <WalletTrays
        accounts={accounts}
        currentAccountIndex={currentAccountIndex}
        onAccountSelect={onAccountSelect}
        delegation={delegation}
        swapTrays={Boolean(settings.swapTrays)}
        glowEffects={settings.glowEffects !== false}
      />
    </>
  );
};

export default WalletShell;
