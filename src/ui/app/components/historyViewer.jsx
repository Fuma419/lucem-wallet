import { Box, Text, Accordion, Button } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import React from 'react';
import { File } from 'react-kawaii';
import {
  getNetwork,
  getTransactions,
  hydrateHistoryDetails,
  setTransactions,
  setTxDetail,
} from '../../../api/extension';
import Transaction from './transaction';
import { isHistoryDetailComplete } from '../../../api/tx/tx-history';

const BATCH = 8;

let slice = [];

let txObject = {};

const HistoryViewer = ({ history, network, currentAddr, addresses }) => {
  const [historySlice, setHistorySlice] = React.useState(null);
  const [page, setPage] = React.useState(1);
  const [final, setFinal] = React.useState(false);
  const [loadNext, setLoadNext] = React.useState(false);
  const [hydratedDetails, setHydratedDetails] = React.useState({});
  const loadGenRef = React.useRef(0);
  const hydratedAttemptRef = React.useRef(new Set());

  const resetPaging = React.useCallback(() => {
    loadGenRef.current += 1;
    slice = [];
    txObject = {};
    hydratedAttemptRef.current = new Set();
    setHistorySlice(null);
    setPage(1);
    setFinal(false);
    setLoadNext(false);
    setHydratedDetails({});
  }, []);

  const getTxs = async () => {
    if (!history) {
      resetPaging();
      return;
    }
    const gen = ++loadGenRef.current;
    const networkId = network?.id;
    try {
      await new Promise((res) => setTimeout(() => res(), 10));
      if (gen !== loadGenRef.current) return;

      slice = slice.concat(
        history.confirmed.slice((page - 1) * BATCH, page * BATCH)
      );

      if (slice.length < page * BATCH) {
        const txs = await getTransactions(page, BATCH);
        if (gen !== loadGenRef.current) return;

        if (txs.length <= 0) {
          setFinal(true);
        } else {
          slice = Array.from(new Set(slice.concat(txs.map((tx) => tx.txHash))));
          // Never write history for a different network than the one on screen.
          const storedNetwork = await getNetwork();
          if (
            gen === loadGenRef.current &&
            networkId &&
            storedNetwork?.id === networkId
          ) {
            await setTransactions(slice);
          }
        }
      }
      if (gen !== loadGenRef.current) return;
      if (slice.length < page * BATCH) setFinal(true);
    } catch (error) {
      if (gen !== loadGenRef.current) return;
      // Never leave the spinner running forever if a provider call fails/hangs;
      // surface whatever we already have (or an empty "No History" state).
      console.warn('Failed to load transaction history:', error?.message || error);
      setFinal(true);
    }
    if (gen === loadGenRef.current) {
      setHistorySlice(slice);
    }
  };

  const headHash = history?.confirmed?.[0];

  React.useEffect(() => {
    resetPaging();
  }, [network?.id, currentAddr, headHash, resetPaging]);

  React.useEffect(() => {
    getTxs();
  }, [history, page, network?.id, currentAddr]);

  React.useEffect(() => {
    const storeTx = setInterval(() => {
      if (Object.keys(txObject).length <= 0) return;
      setTimeout(() => setTxDetail(txObject));
    }, 1000);
    return () => {
      resetPaging();
      clearInterval(storeTx);
    };
  }, [resetPaging]);

  React.useEffect(() => {
    if (!historySlice) return;
    if (historySlice.length >= (page - 1) * BATCH) setLoadNext(false);
  }, [historySlice, page]);

  React.useEffect(() => {
    if (!historySlice || !historySlice.length) return undefined;
    let cancelled = false;
    const missing = historySlice.filter((txHash) => {
      if (hydratedAttemptRef.current.has(txHash)) return false;
      const stored = hydratedDetails[txHash] || history.details?.[txHash];
      return !isHistoryDetailComplete(stored);
    });
    if (!missing.length) return undefined;
    missing.forEach((txHash) => hydratedAttemptRef.current.add(txHash));
    hydrateHistoryDetails(missing)
      .then((map) => {
        if (cancelled) return;
        if (!map || !Object.keys(map).length) return;
        setHydratedDetails((prev) => ({ ...prev, ...map }));
        Object.assign(txObject, map);
      })
      .catch((error) => {
        console.warn(
          'Failed to hydrate transaction history:',
          error?.message || error
        );
      });
    return () => {
      cancelled = true;
    };
  }, [historySlice, history]);

  return (
    <Box position="relative">
      {!(history && historySlice) ? (
        // No center spinner — wallet refresh already indicates loading next
        // to the balance.
        <Box mt="28" minH="4" aria-hidden="true" />
      ) : historySlice.length <= 0 ? (
        <Box
          mt="16"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          opacity="0.5"
        >
          <Box height="2" />
          <Text fontWeight="bold" color="GrayText">
            No History
          </Text>
        </Box>
      ) : (
        <>
          <Accordion
            allowToggle
            borderBottom="none"
            onClick={() => {
            }}
          >
            {historySlice.map((txHash) => {
              if (!history.details[txHash]) history.details[txHash] = {};
              const stored = history.details[txHash];
              const hydrated = hydratedDetails[txHash];
              const detail = isHistoryDetailComplete(hydrated)
                ? hydrated
                : isHistoryDetailComplete(stored)
                  ? stored
                  : hydrated || stored;

              return (
                <Transaction
                  onLoad={(txHash, txDetail) => {
                    txObject[txHash] = txDetail;
                  }}
                  key={txHash}
                  txHash={txHash}
                  detail={detail}
                  currentAddr={currentAddr}
                  addresses={addresses}
                  network={network}
                />
              );
            })}
          </Accordion>
          {final ? (
            <Box
              textAlign="center"
              // mt={18}
              fontSize={16}
              fontWeight="bold"
              color="gray.400"
            >
              ... nothing more
            </Box>
          ) : (
            <Box textAlign="center">
              <Button
                variant="outline"
                onClick={() => {
                  setLoadNext(true);
                  setTimeout(() => setPage(page + 1));
                }}
                colorScheme="gray"
                aria-label="More"
                fontSize={20}
                w="50%"
                h="30px"
                rounded="xl"
              >
                {loadNext ? '...' : <ChevronDownIcon fontSize="30px" />}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default HistoryViewer;
