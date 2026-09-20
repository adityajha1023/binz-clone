import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  ChevronDown,
  Gift,
  Layers,
  Laptop,
  LogIn,
  LogOut,
  MailCheck,
  Menu,
  MessageCircle,
  Leaf,
  Recycle,
  Share2,
  Sprout,
  TreePine,
  UserRound,
} from 'lucide-react';
import { demoImpactStats } from '../data';

export default function Header({
  coins,
  onOpenAccount,
  onOpenTicket,
  onOpenChat,
  onSignOut,
  isSignedIn,
  impactEntries = [],
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [impactOpen, setImpactOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [shareFeedback, setShareFeedback] = useState('');

  const impact = useMemo(() => {
    const totals = impactEntries.reduce((current, entry) => ({
      solid: current.solid + Number(entry?.solid || 0),
      ewaste: current.ewaste + Number(entry?.ewaste || 0),
    }), { solid: 0, ewaste: 0 });
    const co2 = demoImpactStats.co2Reduced + totals.solid * 0.9 + totals.ewaste * 2.6;

    return {
      co2: co2.toFixed(1),
      waste: (demoImpactStats.solidWaste + demoImpactStats.ewaste + totals.solid + totals.ewaste).toFixed(1),
      coins: Math.round(co2 * 10),
      trees: (co2 / 1000).toFixed(2),
    };
  }, [impactEntries]);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 24);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function handleNavToggle() {
    setNavOpen((prev) => !prev);
    setImpactOpen(false);
    setServiceOpen(false);
  }

  function handleNavLinkClick() {
    setNavOpen(false);
    setImpactOpen(false);
    setServiceOpen(false);
  }

  function handleMenuAction(action) {
    handleNavLinkClick();
    action?.();
  }

  function openImpactMenu() {
    setImpactOpen(true);
    setServiceOpen(false);
  }

  function openServiceMenu() {
    setServiceOpen(true);
    setImpactOpen(false);
  }

  function closeImpactMenu() {
    setImpactOpen(false);
  }

  function closeServiceMenu() {
    setServiceOpen(false);
  }

  function handleImpactBlur(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      closeImpactMenu();
    }
  }

  function handleServiceBlur(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      closeServiceMenu();
    }
  }

  function handleImpactToggle(event) {
    event.preventDefault();
    setImpactOpen(!impactOpen);
    setServiceOpen(false);
  }

  function handleServiceToggle(event) {
    event.preventDefault();
    setServiceOpen(!serviceOpen);
    setImpactOpen(false);
  }

  const shareCopy = `I have helped BinZ divert ${impact.waste} kg of waste and save ${impact.co2} kg of carbon (CO₂) with BinZ. That earns ${impact.coins.toLocaleString()} Z‑Coins at 10 Z‑Coins per kg CO₂. 🌱`;

  async function shareImpact(destination) {
    const pageUrl = window.location.origin;
    const message = `${shareCopy} ${pageUrl}`;

    if (destination === 'native') {
      if (navigator.share) {
        try {
          await navigator.share({ title: 'My BinZ impact', text: shareCopy, url: pageUrl });
          setShareFeedback('Impact shared');
        } catch {
          setShareFeedback('');
        }
        return;
      }

      try {
        await navigator.clipboard.writeText(message);
        setShareFeedback('Impact details copied to share anywhere');
      } catch {
        setShareFeedback('Choose X, Instagram, or WhatsApp below');
      }
      return;
    }

    if (destination === 'instagram') {
      window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
      try {
        await navigator.clipboard.writeText(message);
        setShareFeedback('Caption copied — paste it into Instagram');
      } catch {
        setShareFeedback('Copy the impact details to share on Instagram');
      }
      return;
    }

    const shareUrl = destination === 'x'
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <header className={`site-header${isScrolled ? ' scrolled' : ''}`}>
      <a className="brand" href="#home" aria-label="BinZ home">
        <span className="logo-shell">
          <img src="/assets/binz-logo-final.png" alt="BinZ" />
        </span>
      </a>
      <button
        className="menu-toggle"
        type="button"
        aria-expanded={navOpen}
        aria-controls="primary-nav"
        onClick={handleNavToggle}
      >
        <Menu size={22} />
      </button>
      <nav
        id="primary-nav"
        className={`primary-nav${navOpen ? ' open' : ''}`}
        aria-label="Primary navigation"
      >
        <a className="primary-link" href="#home" onClick={handleNavLinkClick}>Home</a>
        <a className="primary-link" href="#scrap" onClick={handleNavLinkClick}>Scrap</a>
        <a className="primary-link" href="#prices" onClick={handleNavLinkClick}>आज का भाव</a>
        <a className="primary-link" href="#earn" onClick={handleNavLinkClick}>Earn Coins</a>
        <a className="primary-link donate-link" href="#donate" onClick={handleNavLinkClick}>
          <Gift size={14} aria-hidden="true" /> Donate
        </a>
        <div
          className={`nav-menu impact-menu${impactOpen ? ' open' : ''}`}
          onMouseEnter={openImpactMenu}
          onMouseLeave={closeImpactMenu}
          onFocus={openImpactMenu}
          onBlur={handleImpactBlur}
        >
          <a
            className="primary-link impact-link"
            href="#tracker"
            aria-expanded={impactOpen}
            aria-controls="impact-dropdown"
            onClick={handleImpactToggle}
          >
            Impact <ChevronDown size={15} aria-hidden="true" />
          </a>
          <div className="impact-dropdown" id="impact-dropdown" role="menu">
            <a href="#certifications" role="menuitem" onClick={handleNavLinkClick}>
              <span className="impact-icon"><Award size={15} /></span>
              <span className="impact-item-title">Certifications</span>
            </a>
            <a href="#services" role="menuitem" onClick={handleNavLinkClick}>
              <span className="impact-icon"><Layers size={15} /></span>
              <span className="impact-item-title">Other services</span>
            </a>
            <a href="#learn" role="menuitem" onClick={handleNavLinkClick}>
              <span className="impact-icon"><Sprout size={15} /></span> 
              <span className="impact-item-title">Know more</span>
            </a>
          </div>
        </div>
        <div
          className={`nav-menu service-menu${serviceOpen ? ' open' : ''}`}
          onMouseEnter={openServiceMenu}
          onMouseLeave={closeServiceMenu}
          onFocus={openServiceMenu}
          onBlur={handleServiceBlur}
        >
          <a
            className="primary-link impact-link"
            href="#service"
            aria-expanded={serviceOpen}
            aria-controls="service-dropdown"
            onClick={handleServiceToggle}
          >
            Service <ChevronDown size={15} aria-hidden="true" />
          </a>
          <div className="impact-dropdown service-dropdown" id="service-dropdown" role="menu">
            <button type="button" role="menuitem" onClick={() => handleMenuAction(onOpenTicket)}>
              <span className="impact-icon"><MailCheck size={15} /></span>
              <span className="impact-item-title">E-waste ticket</span>
            </button>
            <a href="#ewaste-tracker" role="menuitem" onClick={handleNavLinkClick}>
              <span className="impact-icon"><Laptop size={15} /></span>
              <span className="impact-item-title">Track e-waste</span>
            </a>
            <button type="button" role="menuitem" onClick={() => handleMenuAction(onOpenChat)}>
              <span className="impact-icon"><MessageCircle size={15} /></span>
              <span className="impact-item-title">Help and FAQ</span>
            </button>
          </div>
        </div>
      </nav>
      <div className="wallet">
        <span id="coinBalance">{coins}</span>
        <span>Z-Coins</span>
      </div>
      <div className="account-actions">
        {isSignedIn && (
          <div className="profile-impact">
            <span
              className="profile-placeholder"
              tabIndex="0"
              aria-label="Profile and environmental impact"
              title="View your environmental impact"
            >
              <UserRound size={25} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <aside className="profile-impact-card" aria-label="Your environmental impact">
              <div className="impact-card-hero">
                <div className="impact-tree-art" aria-hidden="true">
                  <Leaf size={42} />
                  <Recycle size={17} />
                </div>
                <div>
                  <p>Your total impact</p>
                  <strong>{impact.co2} kg CO₂</strong>
                  <span>carbon saved</span>
                </div>
              </div>
              <div className="impact-card-stats">
                <span><Recycle size={16} aria-hidden="true" /><strong>{impact.waste} kg</strong> waste diverted</span>
                <span><TreePine size={16} aria-hidden="true" /><strong>{impact.trees} trees</strong> equivalent (1 per tonne CO₂)</span>
              </div>
              <div className="impact-share-row" aria-label="Share your impact">
                <button type="button" onClick={() => shareImpact('native')} aria-label="Share your impact">
                  <Share2 size={16} aria-hidden="true" /> Share
                </button>
                <button type="button" onClick={() => shareImpact('x')} aria-label="Share on X">𝕏</button>
                <button type="button" onClick={() => shareImpact('instagram')} aria-label="Share on Instagram" className="instagram-share">◎</button>
                <button type="button" onClick={() => shareImpact('whatsapp')} aria-label="Share on WhatsApp"><MessageCircle size={16} aria-hidden="true" /></button>
              </div>
              {shareFeedback && <span className="impact-share-feedback" role="status">{shareFeedback}</span>}
            </aside>
          </div>
        )}
        <button
          className="icon-button"
          id="accountButton"
          type="button"
          aria-label={isSignedIn ? 'Sign out' : 'Sign in'}
          onClick={isSignedIn ? onSignOut : onOpenAccount}
        >
          {isSignedIn ? <LogOut size={18} /> : <LogIn size={18} />}
          <span>{isSignedIn ? 'Sign out' : 'Sign in'}</span>
        </button>
      </div>
    </header>
  );
}
