const hindiNumbers = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पांच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह',
  'सोलह', 'सत्रह', 'अठारह', 'उन्नीस', 'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस',
  'तीस', 'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस', 'चालीस', 'इकतालीस', 'बयालीस',
  'तैंतालीस', 'चवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास', 'पचास', 'इक्यावन', 'बावन', 'तिरपन', 'चौवन', 'पचपन',
  'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ', 'साठ', 'इकसठ', 'बासठ', 'तिरसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सड़सठ', 'अड़सठ', 'उनहत्तर',
  'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उनासी', 'अस्सी', 'इक्यासी', 'बयासी',
  'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी', 'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पंचानवे',
  'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे',
];

const hindiCities = {
  'Greater Noida': 'ग्रेटर नोएडा',
  Delhi: 'दिल्ली',
  Noida: 'नोएडा',
  Ghaziabad: 'गाज़ियाबाद',
  Lucknow: 'लखनऊ',
  Kanpur: 'कानपुर',
  Agra: 'आगरा',
  Meerut: 'मेरठ',
};

function speakableNumber(value) {
  const number = Number(value);
  if (Number.isInteger(number) && number >= 0 && number < hindiNumbers.length) return hindiNumbers[number];
  if (Number.isInteger(number) && number >= 100 && number < 1000) {
    const hundreds = Math.floor(number / 100);
    const remainder = number % 100;
    return `${hindiNumbers[hundreds]} सौ${remainder ? ` ${speakableNumber(remainder)}` : ''}`;
  }
  return String(value);
}

function indianHindiVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => /^hi[-_]IN$/i.test(voice.lang))
    || voices.find((voice) => voice.lang.toLowerCase().startsWith('hi'))
    || voices.find((voice) => /india/i.test(voice.name) && /^en[-_]IN$/i.test(voice.lang))
    || null;
}

function configureHindiUtterance(utterance) {
  const voice = indianHindiVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || 'hi-IN';
  utterance.rate = 0.88;
  utterance.pitch = 1;
}

function speakHindiText(text, onEnd) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('binz-speech-error', { detail: 'इस browser में आवाज़ की सुविधा उपलब्ध नहीं है।' }));
    }
    return false;
  }
  stopSpeaking();
  const speak = () => {
    const utterance = new window.SpeechSynthesisUtterance(text);
    configureHindiUtterance(utterance);
    if (onEnd) utterance.onend = onEnd;
    utterance.onerror = (event) => {
      window.dispatchEvent(new CustomEvent('binz-speech-error', { detail: event.error || 'आवाज़ शुरू नहीं हो सकी।' }));
    };
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  };

  // Voices can be populated asynchronously, especially in Chrome and Windows.
  if (window.speechSynthesis.getVoices().length) {
    window.setTimeout(speak, 120);
  } else {
    let handled = false;
    const speakOnce = () => {
      if (handled) return;
      handled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', speakOnce);
      speak();
    };
    window.speechSynthesis.addEventListener('voiceschanged', speakOnce, { once: true });
    window.setTimeout(speakOnce, 500);
  }
  return true;
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function speakPrice({ categoryHindi, currentPrice, unit, city }) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const spokenCity = hindiCities[city] || city || 'आपके शहर';
  const text = `आज ${spokenCity} में ${categoryHindi} का भाव ${speakableNumber(currentPrice)} रुपये ${unit === 'kg' ? 'किलो' : `प्रति ${unit}`} है।`;
  return speakHindiText(text);
}

export function speakPriceBoard(prices, city) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !prices.length) return false;
  const spokenCity = hindiCities[city] || city || 'आपके शहर';
  const text = [`आज ${spokenCity} के कबाड़ के भाव।`, ...prices.map((price) => `${price.categoryHindi} का भाव ${speakableNumber(price.currentPrice)} रुपये ${price.unit === 'kg' ? 'किलो' : `प्रति ${price.unit}`} है।`)].join(' ');
  return speakHindiText(text, () => window.dispatchEvent(new Event('binz-speech-ended')));
}
