/**
 * Temporary tab: pair a Ledger and sign. The toolbar popup cannot host a
 * device chooser, and the main wallet must not load in the browser.
 */
import React from 'react';
import '../components/styles.css';
import { TAB } from '../../../config/config';
import Main from '../../index';
import PreventHistoryBack from '../components/PreventHistoryBack';
import { BrowserRouter as Router } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import LedgerSign from '../pages/ledgerSign';

const root = createRoot(window.document.querySelector(`#${TAB.ledgerSign}`));
root.render(
  <Main>
    <Router>
      <>
        <PreventHistoryBack />
        <LedgerSign />
      </>
    </Router>
  </Main>
);

if (module.hot) module.hot.accept();
