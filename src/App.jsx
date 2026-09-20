import React, { useCallback, useEffect, useState } from 'react';
import TopStrip from './components/TopStrip';
import Header from './components/Header';
import SignInPage from './components/SignInPage';
import SignUpPage from './components/SignUpPage';
import LearnPage from './components/LearnPage';
import ServicesPage from './components/ServicesPage';
import CertificationsPage from './components/CertificationsPage';
import DonatePage from './components/DonatePage';
import EWasteTrackerPage from './components/EWasteTrackerPage';
import HeroSection from './components/HeroSection';
import TrustRow from './components/TrustRow';
import StatsBand from './components/StatsBand';
import ScrapSection from './components/ScrapSection';
import EarnSection from './components/EarnSection';
import TrackerSection from './components/TrackerSection';
import LeaderboardSection from './components/LeaderboardSection';
import ServiceSection from './components/ServiceSection';
import PriceDiscoveryPage from './components/PriceDiscoveryPage';
import PricePreview from './components/PricePreview';
import AboutBand from './components/AboutBand';
import Footer from './components/Footer';
import ChatFab from './components/ChatFab';
import ChatDrawer from './components/ChatDrawer';
import AuthDrawer from './components/AuthDrawer';
import TicketDrawer from './components/TicketDrawer';
import Scrim from './components/Scrim';
import { apiUrl } from './api';

const standalonePages = new Set([
  '#signin',
  '#signup',
  '#learn',
  '#services',
  '#certifications',
  '#donate',
  '#ewaste-tracker',
  '#prices',
]);

const mainPageSections = new Set([
  '#home',
  '#scrap',
  '#earn',
  '#tracker',
  '#leaderboard',
  '#service',
  '#about',
  '#contact',
]);

function App() {
  const [coins, setCoins] = useState(0);
  const [firstName, setFirstName] = useState(() => localStorage.getItem('firstName') || 'Guest');
  const [entries, setEntries] = useState(() => JSON.parse(localStorage.getItem('impactEntries') || '[]'));
  const [tickets, setTickets] = useState(() => Number(localStorage.getItem('tickets') || 0));
  const [openDrawer, setOpenDrawer] = useState(null); // 'chatDrawer' | 'authPanel' | 'ticketPanel' | null
  const [pickupStatus, setPickupStatus] = useState({ msg: '', error: false });
  const [ticketTypePreset, setTicketTypePreset] = useState('');
  const [currentPage, setCurrentPage] = useState(() => window.location.hash);

  const refreshCoins = useCallback(async () => {
    const email = localStorage.getItem('email');
    if (!email) {
      setCoins(0);
      return;
    }

    try {
      const response = await fetch(
        apiUrl(`/getCoins/${encodeURIComponent(email)}`),
      );
      if (!response.ok) throw new Error('Unable to load coin balance');

      const result = await response.json();
      if (typeof result.coins === 'number') setCoins(Math.max(0, result.coins));
    } catch {
      setPickupStatus({
        msg: 'Unable to refresh your Z-Coins right now.',
        error: true,
      });
    }
  }, []);

  useEffect(() => {
    localStorage.removeItem('coins');

    function handleCoinsUpdated(event) {
      const next = Math.max(0, Number(event.detail?.coins));
      if (!Number.isFinite(next)) return;
      setCoins(next);
    }

    window.addEventListener('coinsUpdated', handleCoinsUpdated);
    return () => {
      window.removeEventListener('coinsUpdated', handleCoinsUpdated);
    };
  }, []);

  useEffect(() => {
    Promise.resolve()
      .then(() => fetch(apiUrl('/session'), { credentials: 'include' }))
      .then((response) => {
        if (!response.ok) throw new Error('No active session');
        return response.json();
      })
      .then((account) => {
        setFirstName(account.firstName || 'Guest');
        localStorage.setItem('firstName', account.firstName || '');
        localStorage.setItem('lastName', account.lastName || '');
        localStorage.setItem('email', account.email || '');
        localStorage.setItem('state', account.state || '');
        updateCoins(account.coins, { persist: false });
      })
      .catch(() => {
        ['firstName', 'lastName', 'email', 'state'].forEach((key) => localStorage.removeItem(key));
        setFirstName('Guest');
        updateCoins(0, { persist: false });
      });
  }, []);

  useEffect(() => {
    function handleHashChange() {
      setCurrentPage(window.location.hash);
      refreshCoins();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshCoins();
    }

    refreshCoins();
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('focus', refreshCoins);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('focus', refreshCoins);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshCoins]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (standalonePages.has(currentPage) || currentPage === '#home' || !currentPage) {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        return;
      }

      if (!mainPageSections.has(currentPage)) return;

      const target = document.getElementById(currentPage.slice(1));
      if (!target) return;

      const headerHeight = document.querySelector('.site-header')?.offsetHeight || 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 18;
      window.scrollTo({ top: Math.max(0, top), left: 0, behavior: 'auto' });
    });
  }, [currentPage]);

  function updateCoins(value, { persist = true } = {}) {
    const next = Math.max(0, Number(value));
    if (!Number.isFinite(next)) return;

    window.dispatchEvent(new CustomEvent('coinsUpdated', { detail: { coins: next } }));

    const email = localStorage.getItem('email');
    const delta = next - coins;
    if (!persist || !email || delta === 0) return;

    Promise.resolve()
      .then(() => fetch(apiUrl('/rewardCoins'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, coins: delta }),
      }))
      .then((response) => {
        if (!response.ok) throw new Error('Unable to save coin balance');
        return response.json();
      })
      .then((result) => {
        if (typeof result.coins === 'number') {
          window.dispatchEvent(new CustomEvent('coinsUpdated', {
            detail: { coins: result.coins },
          }));
        }
      })
      .catch(() => {
        setPickupStatus({
          msg: 'Coins updated on screen, but could not be saved to your account.',
          error: true,
        });
      });
  }

  function handleAuthenticated(account) {
    const accountName = account.firstName || 'Guest';
    setFirstName(accountName);
    localStorage.setItem('firstName', accountName);
    localStorage.setItem('lastName', account.lastName || '');
    localStorage.setItem('email', account.email || '');
    localStorage.setItem('state', account.state || '');
    updateCoins(account.coins, { persist: false });
    refreshCoins();
    window.location.hash = '#home';
  }

  function handleSignOut() {
    Promise.resolve()
      .then(() => fetch(apiUrl('/logout'), {
        method: 'POST',
        credentials: 'include',
      }))
      .catch(() => {});
    ['firstName', 'lastName', 'email', 'state'].forEach((key) => localStorage.removeItem(key));
    setFirstName('Guest');
    updateCoins(0, { persist: false });
  }

  function handleOpenDrawer(id) {
    setOpenDrawer(id);
  }

  function handleCloseDrawers() {
    setOpenDrawer(null);
  }

  function handleSellEwaste(itemName) {
    const preset = itemName.includes('Laptop') ? 'Laptop' : itemName.includes('Mobile') ? 'Mobile phone' : 'Battery';
    setTicketTypePreset(preset);
    setOpenDrawer('ticketPanel');
  }

  function handleSellNormal(itemName) {
    window.location.hash = '#home';
    document.getElementById('phoneInput')?.focus();
    setPickupStatus({ msg: `${itemName} selected. Add your phone number to book pickup.`, error: false });
  }

  function handleOpenSignIn() {
    window.location.hash = '#signin';
  }

  function renderDrawers() {
    return (
      <>
        <ChatFab onOpen={() => handleOpenDrawer('chatDrawer')} />

        <ChatDrawer
          isOpen={openDrawer === 'chatDrawer'}
          onClose={handleCloseDrawers}
        />
        <AuthDrawer
          isOpen={openDrawer === 'authPanel'}
          onClose={handleCloseDrawers}
          coins={coins}
          updateCoins={updateCoins}
          setFirstName={setFirstName}
        />
        <TicketDrawer
          isOpen={openDrawer === 'ticketPanel'}
          onClose={handleCloseDrawers}
          ticketTypePreset={ticketTypePreset}
          tickets={tickets}
          setTickets={setTickets}
          updateCoins={updateCoins}
          coins={coins}
          setEntries={setEntries}
          entries={entries}
        />
        <Scrim visible={openDrawer !== null} onClick={handleCloseDrawers} />
      </>
    );
  }

  function renderStandalonePage(page) {
    return (
      <>
        <TopStrip />
        <Header
          coins={coins}
          onOpenAccount={handleOpenSignIn}
          onOpenTicket={() => handleOpenDrawer('ticketPanel')}
          onOpenChat={() => handleOpenDrawer('chatDrawer')}
          onSignOut={handleSignOut}
          isSignedIn={firstName !== 'Guest' && Boolean(localStorage.getItem('email'))}
          impactEntries={entries}
        />
        {page}
        {renderDrawers()}
      </>
    );
  }

  if (currentPage === '#signin') {
    return renderStandalonePage(<SignInPage onAuthenticated={handleAuthenticated} />);
  }

  if (currentPage === '#signup') {
    return renderStandalonePage(<SignUpPage onAuthenticated={handleAuthenticated} />);
  }

  if (currentPage === '#learn') {
    return renderStandalonePage(<LearnPage />);
  }

  if (currentPage === '#services') {
    return renderStandalonePage(<ServicesPage />);
  }

  if (currentPage === '#certifications') {
    return renderStandalonePage(<CertificationsPage />);
  }

  if (currentPage === '#donate') {
    return renderStandalonePage(<DonatePage />);
  }

  if (currentPage === '#ewaste-tracker') {
    return renderStandalonePage(<EWasteTrackerPage />);
  }

  if (currentPage === '#prices') {
    return renderStandalonePage(<PriceDiscoveryPage />);
  }

  return (
    <>
      <TopStrip />
      <Header
        coins={coins}
        onOpenAccount={handleOpenSignIn}
        onOpenTicket={() => handleOpenDrawer('ticketPanel')}
        onOpenChat={() => handleOpenDrawer('chatDrawer')}
        onSignOut={handleSignOut}
        isSignedIn={firstName !== 'Guest' && Boolean(localStorage.getItem('email'))}
        impactEntries={entries}
      />
      <main>
        <HeroSection
          entries={entries}
          pickupStatus={pickupStatus}
          setPickupStatus={setPickupStatus}
        />
        <TrustRow />
        <StatsBand entries={entries} tickets={tickets} />
        <PricePreview />
        <ScrapSection
          onSellEwaste={handleSellEwaste}
          onSellNormal={handleSellNormal}
        />
        <EarnSection coins={coins} updateCoins={updateCoins} />
        <TrackerSection
          entries={entries}
          setEntries={setEntries}
          tickets={tickets}
          updateCoins={updateCoins}
          coins={coins}
        />
        <LeaderboardSection coins={coins} firstName={firstName} />
        <ServiceSection
          onOpenTicket={() => handleOpenDrawer('ticketPanel')}
          onOpenAccount={() => handleOpenDrawer('authPanel')}
          onOpenChat={() => handleOpenDrawer('chatDrawer')}
        />
        <AboutBand />
      </main>
      <Footer />
      {renderDrawers()}
    </>
  );
}

export default App;
