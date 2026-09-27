export interface Nakshatra {
  id: number;
  name: string;
  sanskrit: string;
  startDeg: number;
  endDeg: number;
  ruler: string;
  deity: string;
  symbol: string;
  animal: string;
  element: string;
  guna: string;
  gana: string;
  meaning: string;
  description: string;
}

export interface Rashi {
  id: number;
  name: string;
  sanskrit: string;
  ruler: string;
  element: string;
  quality: string;
  startDeg: number;
  symbol: string;
}

export const nakshatras: Nakshatra[] = [
  {
    id: 1, name: "Ashwini", sanskrit: "अश्विनी",
    startDeg: 0, endDeg: 13.3333,
    ruler: "Ketu", deity: "Ashwini Kumaras (Divine Physicians)",
    symbol: "Horse's Head", animal: "Horse (Male)",
    element: "Earth", guna: "Rajas", gana: "Deva",
    meaning: "Born of a female horse",
    description: "The star of transport. Ashwini natives are quick healers, fast-moving, and natural first responders. They initiate action without hesitation and carry the energy of dawn — the first light before anyone else wakes."
  },
  {
    id: 2, name: "Bharani", sanskrit: "भरणी",
    startDeg: 13.3333, endDeg: 26.6667,
    ruler: "Venus", deity: "Yama (God of Death & Dharma)",
    symbol: "Yoni (Female Reproductive Organ)", animal: "Elephant (Male)",
    element: "Earth", guna: "Rajas", gana: "Manushya",
    meaning: "The bearer",
    description: "The star of restraint. Bharani carries the weight of life and death. These natives understand extremes — creation, destruction, pleasure, pain. Intensely sexual, deeply moral, and unafraid of taboo."
  },
  {
    id: 3, name: "Krittika", sanskrit: "कृत्तिका",
    startDeg: 26.6667, endDeg: 40,
    ruler: "Sun", deity: "Agni (God of Fire)",
    symbol: "Razor / Flame", animal: "Goat (Female)",
    element: "Fire", guna: "Rajas", gana: "Rakshasa",
    meaning: "The cutter",
    description: "The star of fire. Krittika burns away impurity. Sharp tongue, sharp mind, sharp will. These natives purify everything they touch. They cut through illusion but can burn bridges if unchecked."
  },
  {
    id: 4, name: "Rohini", sanskrit: "रोहिणी",
    startDeg: 40, endDeg: 53.3333,
    ruler: "Moon", deity: "Brahma (Creator God)",
    symbol: "Ox Cart / Chariot", animal: "Serpent (Male)",
    element: "Earth", guna: "Rajas", gana: "Manushya",
    meaning: "The red one",
    description: "The star of ascent. Rohini is the Moon's favorite wife — magnetic, fertile, and impossibly attractive. Natives possess natural beauty, artistic talent, and material abundance. Jealousy follows them."
  },
  {
    id: 5, name: "Mrigashira", sanskrit: "मृगशीर्ष",
    startDeg: 53.3333, endDeg: 66.6667,
    ruler: "Mars", deity: "Soma (Moon God)",
    symbol: "Deer's Head", animal: "Serpent (Female)",
    element: "Earth", guna: "Tamas", gana: "Deva",
    meaning: "The deer's head",
    description: "The star of searching. Eternally curious, always seeking. Mrigashira natives are researchers, wanderers, and questioners. They chase what they desire but the chase itself is the point."
  },
  {
    id: 6, name: "Ardra", sanskrit: "आर्द्रा",
    startDeg: 66.6667, endDeg: 80,
    ruler: "Rahu", deity: "Rudra (Storm God)",
    symbol: "Teardrop / Diamond", animal: "Dog (Female)",
    element: "Water", guna: "Tamas", gana: "Manushya",
    meaning: "The moist one",
    description: "The star of sorrow and transformation. Ardra brings storms that clear the air. Intense emotional depth, intellectual brilliance, and destructive-creative power. Suffering becomes their teacher."
  },
  {
    id: 7, name: "Punarvasu", sanskrit: "पुनर्वसु",
    startDeg: 80, endDeg: 93.3333,
    ruler: "Jupiter", deity: "Aditi (Mother of Gods)",
    symbol: "Bow and Quiver", animal: "Cat (Female)",
    element: "Water", guna: "Tamas", gana: "Deva",
    meaning: "Return of the light",
    description: "The star of renewal. No matter how far they fall, Punarvasu natives bounce back. Optimistic, philosophical, and blessed with second chances. They restore what was lost and find home everywhere."
  },
  {
    id: 8, name: "Pushya", sanskrit: "पुष्य",
    startDeg: 93.3333, endDeg: 106.6667,
    ruler: "Saturn", deity: "Brihaspati (Guru of Gods)",
    symbol: "Cow's Udder / Lotus", animal: "Goat (Male)",
    element: "Water", guna: "Tamas", gana: "Deva",
    meaning: "Nourisher",
    description: "The most auspicious nakshatra. Pushya nourishes everything it touches. Natives are generous, wise, and protective. They build institutions, mentor others, and create lasting abundance through patience."
  },
  {
    id: 9, name: "Ashlesha", sanskrit: "आश्लेषा",
    startDeg: 106.6667, endDeg: 120,
    ruler: "Mercury", deity: "Naga (Serpent Gods)",
    symbol: "Coiled Serpent", animal: "Cat (Male)",
    element: "Water", guna: "Satva", gana: "Rakshasa",
    meaning: "The entwiner",
    description: "The star of the serpent. Hypnotic, cunning, and deeply intuitive. Ashlesha natives see through deception because they understand it intimately. Poison and medicine live in the same fang."
  },
  {
    id: 10, name: "Magha", sanskrit: "मघा",
    startDeg: 120, endDeg: 133.3333,
    ruler: "Ketu", deity: "Pitris (Ancestral Spirits)",
    symbol: "Royal Throne", animal: "Rat (Male)",
    element: "Fire", guna: "Satva", gana: "Rakshasa",
    meaning: "The mighty one",
    description: "The star of power and ancestry. Magha carries royal blood and ancestral karma. Natives command authority naturally, honor tradition, and feel the weight of lineage. Born to rule or rebel against rulers."
  },
  {
    id: 11, name: "Purva Phalguni", sanskrit: "पूर्व फाल्गुनी",
    startDeg: 133.3333, endDeg: 146.6667,
    ruler: "Venus", deity: "Bhaga (God of Fortune & Marriage)",
    symbol: "Front Legs of Bed / Hammock", animal: "Rat (Female)",
    element: "Fire", guna: "Satva", gana: "Manushya",
    meaning: "The former red one",
    description: "The star of love and luxury. Life is meant to be enjoyed. Purva Phalguni natives are charming, creative, and pleasure-seeking. They attract wealth and romance effortlessly but must guard against laziness."
  },
  {
    id: 12, name: "Uttara Phalguni", sanskrit: "उत्तर फाल्गुनी",
    startDeg: 146.6667, endDeg: 160,
    ruler: "Sun", deity: "Aryaman (God of Contracts & Unions)",
    symbol: "Back Legs of Bed", animal: "Cow (Male)",
    element: "Fire", guna: "Satva", gana: "Manushya",
    meaning: "The latter red one",
    description: "The star of patronage. Where Purva Phalguni plays, Uttara Phalguni commits. Natives are loyal, service-oriented, and build lasting partnerships. They honor agreements and uplift communities."
  },
  {
    id: 13, name: "Hasta", sanskrit: "हस्त",
    startDeg: 160, endDeg: 173.3333,
    ruler: "Moon", deity: "Savitar (Sun God of Inspiration)",
    symbol: "Open Hand / Fist", animal: "Buffalo (Female)",
    element: "Fire", guna: "Rajas", gana: "Deva",
    meaning: "The hand",
    description: "The star of skill. Hasta natives are craftspeople, healers, and magicians. Their hands create miracles — literally. Dexterous, clever, and adaptable. They can manifest anything through focused effort."
  },
  {
    id: 14, name: "Chitra", sanskrit: "चित्रा",
    startDeg: 173.3333, endDeg: 186.6667,
    ruler: "Mars", deity: "Vishvakarma (Divine Architect)",
    symbol: "Bright Jewel / Pearl", animal: "Tiger (Female)",
    element: "Fire", guna: "Rajas", gana: "Rakshasa",
    meaning: "The brilliant one",
    description: "The star of opportunity. Chitra natives are architects of reality — they see beauty in structure and create masterpieces. Magnetic appearance, artistic vision, and a drive to build something extraordinary."
  },
  {
    id: 15, name: "Swati", sanskrit: "स्वाती",
    startDeg: 186.6667, endDeg: 200,
    ruler: "Rahu", deity: "Vayu (God of Wind)",
    symbol: "Young Plant / Coral", animal: "Buffalo (Male)",
    element: "Air", guna: "Rajas", gana: "Deva",
    meaning: "The independent one",
    description: "The star of the wind. Freedom is non-negotiable. Swati natives are independent, diplomatic, and adaptable. Like wind, they move through every environment. Business-minded with a talent for trade and negotiation."
  },
  {
    id: 16, name: "Vishakha", sanskrit: "विशाखा",
    startDeg: 200, endDeg: 213.3333,
    ruler: "Jupiter", deity: "Indra-Agni (King & Fire)",
    symbol: "Triumphal Arch / Potter's Wheel", animal: "Tiger (Male)",
    element: "Air", guna: "Rajas", gana: "Rakshasa",
    meaning: "The forked one",
    description: "The star of purpose. Once Vishakha sets a goal, nothing stops them. Single-minded determination bordering on obsession. They split the world into before and after they arrive. Conquerors by nature."
  },
  {
    id: 17, name: "Anuradha", sanskrit: "अनुराधा",
    startDeg: 213.3333, endDeg: 226.6667,
    ruler: "Saturn", deity: "Mitra (God of Friendship & Alliance)",
    symbol: "Lotus / Triumphal Gateway", animal: "Deer (Female)",
    element: "Air", guna: "Tamas", gana: "Deva",
    meaning: "Following Radha",
    description: "The star of devotion. Anuradha blooms in the hardest soil. Natives build deep friendships, thrive in foreign lands, and succeed through persistence. They organize, network, and create loyal communities."
  },
  {
    id: 18, name: "Jyeshtha", sanskrit: "ज्येष्ठा",
    startDeg: 226.6667, endDeg: 240,
    ruler: "Mercury", deity: "Indra (King of Gods)",
    symbol: "Circular Talisman / Earring", animal: "Deer (Male)",
    element: "Air", guna: "Tamas", gana: "Rakshasa",
    meaning: "The eldest",
    description: "The star of the chief. Jyeshtha carries the burden of being first — the eldest sibling, the alpha. Protective, proud, and often tormented by their own power. They guard others at the cost of their own peace."
  },
  {
    id: 19, name: "Mula", sanskrit: "मूल",
    startDeg: 240, endDeg: 253.3333,
    ruler: "Ketu", deity: "Nirriti (Goddess of Destruction & Calamity)",
    symbol: "Bundle of Roots / Tied Bunch", animal: "Dog (Male)",
    element: "Air", guna: "Tamas", gana: "Rakshasa",
    meaning: "The root",
    description: "The star of the foundation. Mula tears everything down to the root. Natives experience destruction as a form of liberation. They dig deep, uncover truth, and rebuild from nothing. Researchers and investigators."
  },
  {
    id: 20, name: "Purva Ashadha", sanskrit: "पूर्वाषाढ़ा",
    startDeg: 253.3333, endDeg: 266.6667,
    ruler: "Venus", deity: "Apas (Water Deity)",
    symbol: "Elephant's Tusk / Fan", animal: "Monkey (Male)",
    element: "Water", guna: "Satva", gana: "Manushya",
    meaning: "The former invincible one",
    description: "The star of invincibility. Purva Ashadha cannot be defeated — they regenerate like water. Persuasive, ambitious, and emotionally intelligent. Their enthusiasm is contagious and their conviction unshakeable."
  },
  {
    id: 21, name: "Uttara Ashadha", sanskrit: "उत्तराषाढ़ा",
    startDeg: 266.6667, endDeg: 280,
    ruler: "Sun", deity: "Vishvadevas (Universal Gods)",
    symbol: "Elephant's Tusk / Small Bed", animal: "Mongoose (Male)",
    element: "Water", guna: "Satva", gana: "Manushya",
    meaning: "The latter invincible one",
    description: "The star of universal victory. Where Purva Ashadha inspires, Uttara Ashadha finishes. Permanent, lasting victories. These natives earn respect through integrity and become pillars of society."
  },
  {
    id: 22, name: "Shravana", sanskrit: "श्रवण",
    startDeg: 280, endDeg: 293.3333,
    ruler: "Moon", deity: "Vishnu (The Preserver)",
    symbol: "Three Footprints / Ear", animal: "Monkey (Female)",
    element: "Water", guna: "Satva", gana: "Deva",
    meaning: "The listener",
    description: "The star of learning. Shravana natives learn by listening — to people, to silence, to the universe. They connect knowledge across domains. Teachers, counselors, and media professionals thrive here."
  },
  {
    id: 23, name: "Dhanishta", sanskrit: "धनिष्ठा",
    startDeg: 293.3333, endDeg: 306.6667,
    ruler: "Mars", deity: "Vasus (Eight Elemental Gods)",
    symbol: "Drum / Flute", animal: "Lion (Female)",
    element: "Ether", guna: "Rajas", gana: "Rakshasa",
    meaning: "The wealthiest",
    description: "The star of symphony. Dhanishta vibrates with abundance — material and musical. Natives are rhythmic, prosperous, and communal. They keep the beat that holds groups together. Wealth finds them naturally."
  },
  {
    id: 24, name: "Shatabhisha", sanskrit: "शतभिषा",
    startDeg: 306.6667, endDeg: 320,
    ruler: "Rahu", deity: "Varuna (God of Cosmic Waters)",
    symbol: "Empty Circle / 100 Flowers", animal: "Horse (Female)",
    element: "Ether", guna: "Rajas", gana: "Rakshasa",
    meaning: "The hundred healers",
    description: "The star of the healer. Shatabhisha operates in solitude and secrecy. Natives are unconventional healers, researchers, and truth-seekers. They see what others cannot and heal what others won't touch."
  },
  {
    id: 25, name: "Purva Bhadrapada", sanskrit: "पूर्व भाद्रपद",
    startDeg: 320, endDeg: 333.3333,
    ruler: "Jupiter", deity: "Aja Ekapada (One-Footed Goat)",
    symbol: "Sword / Two-Faced Man", animal: "Lion (Male)",
    element: "Ether", guna: "Rajas", gana: "Manushya",
    meaning: "The former lucky feet",
    description: "The star of the burning pair. Intense spiritual fire that burns away ego. Purva Bhadrapada natives walk between worlds — mystical, extreme, and transformative. They can be ascetics or tyrants."
  },
  {
    id: 26, name: "Uttara Bhadrapada", sanskrit: "उत्तर भाद्रपद",
    startDeg: 333.3333, endDeg: 346.6667,
    ruler: "Saturn", deity: "Ahir Budhnya (Serpent of the Depths)",
    symbol: "Back Legs of Funeral Cot / Twins", animal: "Cow (Female)",
    element: "Ether", guna: "Tamas", gana: "Manushya",
    meaning: "The latter lucky feet",
    description: "The star of the depths. Uttara Bhadrapada has penetrated the deepest waters and returned with wisdom. Controlled, compassionate, and profoundly spiritual. They master the unseen forces with discipline."
  },
  {
    id: 27, name: "Revati", sanskrit: "रेवती",
    startDeg: 346.6667, endDeg: 360,
    ruler: "Mercury", deity: "Pushan (God of Nourishment & Travel)",
    symbol: "Fish / Drum", animal: "Elephant (Female)",
    element: "Ether", guna: "Tamas", gana: "Deva",
    meaning: "The wealthy one",
    description: "The star of journeys. The final nakshatra — where the cycle completes. Revati natives are gentle souls who guide others to safety. They are travelers, protectors of the lost, and believers in happy endings."
  },
];

export const rashis: Rashi[] = [
  { id: 1, name: "Mesha (Aries)", sanskrit: "मेष", ruler: "Mars", element: "Fire", quality: "Cardinal", startDeg: 0, symbol: "♈" },
  { id: 2, name: "Vrishabha (Taurus)", sanskrit: "वृषभ", ruler: "Venus", element: "Earth", quality: "Fixed", startDeg: 30, symbol: "♉" },
  { id: 3, name: "Mithuna (Gemini)", sanskrit: "मिथुन", ruler: "Mercury", element: "Air", quality: "Mutable", startDeg: 60, symbol: "♊" },
  { id: 4, name: "Karka (Cancer)", sanskrit: "कर्क", ruler: "Moon", element: "Water", quality: "Cardinal", startDeg: 90, symbol: "♋" },
  { id: 5, name: "Simha (Leo)", sanskrit: "सिंह", ruler: "Sun", element: "Fire", quality: "Fixed", startDeg: 120, symbol: "♌" },
  { id: 6, name: "Kanya (Virgo)", sanskrit: "कन्या", ruler: "Mercury", element: "Earth", quality: "Mutable", startDeg: 150, symbol: "♍" },
  { id: 7, name: "Tula (Libra)", sanskrit: "तुला", ruler: "Venus", element: "Air", quality: "Cardinal", startDeg: 180, symbol: "♎" },
  { id: 8, name: "Vrischika (Scorpio)", sanskrit: "वृश्चिक", ruler: "Pluto", element: "Water", quality: "Fixed", startDeg: 210, symbol: "♏" },
  { id: 9, name: "Dhanu (Sagittarius)", sanskrit: "धनु", ruler: "Jupiter", element: "Fire", quality: "Mutable", startDeg: 240, symbol: "♐" },
  { id: 10, name: "Makara (Capricorn)", sanskrit: "मकर", ruler: "Saturn", element: "Earth", quality: "Cardinal", startDeg: 270, symbol: "♑" },
  { id: 11, name: "Kumbha (Aquarius)", sanskrit: "कुम्भ", ruler: "Saturn", element: "Air", quality: "Fixed", startDeg: 300, symbol: "♒" },
  { id: 12, name: "Meena (Pisces)", sanskrit: "मीन", ruler: "Jupiter", element: "Water", quality: "Mutable", startDeg: 330, symbol: "♓" },
];

export const getRashiFromDeg = (deg: number): Rashi => {
  const norm = ((deg % 360) + 360) % 360;
  const idx = Math.floor(norm / 30);
  return rashis[idx];
};

export const getNakshatraFromDeg = (deg: number): { nakshatra: Nakshatra; pada: number; degInNak: number } => {
  const norm = ((deg % 360) + 360) % 360;
  const NAK_SPAN = 360 / 27; // Exact: 13.33333... degrees
  const PADA_SPAN = NAK_SPAN / 4; // Exact: 3.33333... degrees
  const nakIdx = Math.min(Math.floor(norm / NAK_SPAN), 26);
  const nak = nakshatras[nakIdx];
  const degInNak = norm - nakIdx * NAK_SPAN;
  const pada = Math.min(Math.floor(degInNak / PADA_SPAN) + 1, 4);
  return { nakshatra: nak, pada, degInNak };
};
