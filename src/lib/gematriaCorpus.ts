// Bundled curated seed corpus for gematria value-matching.
// Categories chosen for cultural/linguistic breadth without medical/predictive intent.
// Values are precomputed once at module load into cipher→value→phrase[] maps
// for O(1) lookup during matching.

import { computeAll, normalize, type CipherKey } from "./gematria";

export interface CorpusEntry {
  phrase: string;
  category: string;
}

const RAW: Array<[string, string[]]> = [
  ["Country", [
    "United States","United Kingdom","Canada","Mexico","Brazil","Argentina","France","Germany",
    "Italy","Spain","Portugal","Netherlands","Belgium","Switzerland","Austria","Sweden","Norway",
    "Denmark","Finland","Iceland","Ireland","Poland","Ukraine","Russia","Turkey","Greece","Egypt",
    "Israel","Saudi Arabia","Iran","Iraq","Syria","Lebanon","Jordan","Yemen","Oman","Qatar",
    "Kuwait","Bahrain","India","Pakistan","Bangladesh","Sri Lanka","Nepal","China","Japan",
    "South Korea","North Korea","Vietnam","Thailand","Cambodia","Laos","Myanmar","Malaysia",
    "Singapore","Indonesia","Philippines","Australia","New Zealand","South Africa","Nigeria",
    "Kenya","Ethiopia","Ghana","Morocco","Algeria","Tunisia","Libya","Sudan","Somalia",
    "Colombia","Venezuela","Peru","Chile","Bolivia","Ecuador","Uruguay","Paraguay","Cuba",
    "Jamaica","Haiti","Dominican Republic","Panama","Costa Rica","Guatemala","Honduras",
  ]],
  ["US State", [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
    "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
    "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
    "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
    "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
    "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
    "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
  ]],
  ["City", [
    "New York","Los Angeles","Chicago","Houston","Phoenix","Philadelphia","San Antonio",
    "San Diego","Dallas","Austin","London","Paris","Berlin","Madrid","Rome","Athens",
    "Moscow","Beijing","Tokyo","Seoul","Delhi","Mumbai","Bangkok","Singapore","Sydney",
    "Melbourne","Toronto","Vancouver","Montreal","Mexico City","Buenos Aires","Lima",
    "Rio de Janeiro","Sao Paulo","Bogota","Caracas","Cairo","Jerusalem","Istanbul","Dubai",
    "Riyadh","Tehran","Baghdad","Nairobi","Lagos","Johannesburg","Cape Town","Casablanca",
  ]],
  ["Planet", [
    "Mercury","Venus","Earth","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","Sun","Moon",
  ]],
  ["Zodiac", [
    "Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius",
    "Capricorn","Aquarius","Pisces",
  ]],
  ["Month", [
    "January","February","March","April","May","June","July","August","September","October",
    "November","December",
  ]],
  ["Day", [
    "Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday",
  ]],
  ["Element", [
    "Hydrogen","Helium","Lithium","Beryllium","Boron","Carbon","Nitrogen","Oxygen","Fluorine",
    "Neon","Sodium","Magnesium","Aluminum","Silicon","Phosphorus","Sulfur","Chlorine","Argon",
    "Potassium","Calcium","Iron","Copper","Zinc","Silver","Gold","Mercury","Platinum","Lead",
    "Uranium","Plutonium",
  ]],
  ["Color", [
    "Red","Orange","Yellow","Green","Blue","Indigo","Violet","Purple","Black","White","Gray",
    "Brown","Pink","Gold","Silver","Crimson","Scarlet","Turquoise","Cyan","Magenta",
  ]],
  ["Bible book", [
    "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","Samuel",
    "Kings","Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes",
    "Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah",
    "Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew",
    "Mark","Luke","John","Acts","Romans","Corinthians","Galatians","Ephesians","Philippians",
    "Colossians","Thessalonians","Timothy","Titus","Philemon","Hebrews","James","Peter","Jude",
    "Revelation",
  ]],
  ["Biblical name", [
    "Adam","Eve","Cain","Abel","Seth","Enoch","Noah","Abraham","Isaac","Jacob","Joseph",
    "Moses","Aaron","Joshua","David","Solomon","Elijah","Elisha","Isaiah","Jeremiah",
    "Daniel","Ezekiel","Jonah","Mary","Jesus","Peter","Paul","John","James","Judas","Thomas",
    "Matthew","Mark","Luke","Andrew","Simon","Bartholomew","Philip","Michael","Gabriel",
    "Raphael","Uriel","Metatron","Sandalphon",
  ]],
  ["Mythology", [
    "Zeus","Hera","Poseidon","Hades","Apollo","Artemis","Athena","Ares","Aphrodite","Hermes",
    "Hephaestus","Dionysus","Demeter","Persephone","Odin","Thor","Loki","Freya","Frigg","Tyr",
    "Baldur","Heimdall","Ra","Osiris","Isis","Horus","Anubis","Thoth","Bastet","Sekhmet",
    "Set","Nut","Geb","Ptah","Hathor","Krishna","Vishnu","Shiva","Brahma","Ganesha","Lakshmi",
    "Kali","Durga","Saraswati","Indra","Agni","Buddha","Amaterasu","Susanoo","Quetzalcoatl",
  ]],
  ["Concept", [
    "Love","Hate","Peace","War","Life","Death","Truth","Lie","Faith","Doubt","Hope","Fear",
    "Joy","Sorrow","Light","Dark","Good","Evil","Order","Chaos","Wisdom","Folly","Justice",
    "Freedom","Power","Money","Time","Space","Mind","Soul","Spirit","Body","Heart","Blood",
    "Fire","Water","Earth","Air","Wind","Storm","Sun","Star","Moon","Sea","Sky","Mountain",
  ]],
  ["Historical figure", [
    "Napoleon","Caesar","Cleopatra","Alexander","Charlemagne","Constantine","Genghis Khan",
    "Marco Polo","Columbus","Magellan","Washington","Lincoln","Jefferson","Franklin","Edison",
    "Tesla","Einstein","Newton","Galileo","Copernicus","Darwin","Freud","Marx","Lenin","Stalin",
    "Hitler","Churchill","Roosevelt","Kennedy","Nixon","Reagan","Obama","Trump","Biden",
    "Gandhi","Mandela","Mao","Confucius","Aristotle","Plato","Socrates","Homer","Shakespeare",
  ]],
  ["Modern figure", [
    "Elon Musk","Steve Jobs","Bill Gates","Mark Zuckerberg","Jeff Bezos","Warren Buffett",
    "Oprah Winfrey","Michael Jordan","LeBron James","Kobe Bryant","Muhammad Ali","Tiger Woods",
    "Serena Williams","Roger Federer","Cristiano Ronaldo","Lionel Messi","Tom Brady",
    "Taylor Swift","Beyonce","Rihanna","Madonna","Elvis Presley","Michael Jackson","Prince",
    "John Lennon","Paul McCartney","Bob Dylan","Kanye West","Jay-Z","Drake","Eminem",
  ]],
  ["Common name", [
    "Aaron","Adam","Alex","Alice","Andrew","Anna","Ben","Brian","Carl","Charles","Chris",
    "Daniel","David","Diana","Edward","Elizabeth","Emily","Emma","Eric","Ethan","Frank",
    "George","Grace","Hannah","Harry","Helen","Henry","Isaac","Jack","Jacob","James","Jane",
    "Jason","Jennifer","Jessica","John","Jonathan","Joseph","Julia","Justin","Karen","Kate",
    "Kevin","Laura","Linda","Lisa","Luke","Mark","Martha","Mary","Matthew","Michael","Nancy",
    "Nathan","Nicholas","Nicole","Noah","Olivia","Patricia","Paul","Peter","Rachel","Rebecca",
    "Richard","Robert","Ruth","Samuel","Sarah","Simon","Sophia","Stephen","Steven","Susan",
    "Thomas","Timothy","Victoria","William","Zachary",
  ]],
  ["Company", [
    "Apple","Google","Microsoft","Amazon","Meta","Facebook","Tesla","Netflix","Nvidia",
    "Oracle","IBM","Intel","Samsung","Sony","Toyota","Ford","Boeing","Coca Cola","Pepsi",
    "Nike","Adidas","Disney","Walmart","Target","Costco","Starbucks","McDonalds","Uber",
    "Airbnb","Spotify","OpenAI","Anthropic",
  ]],
  ["Occult", [
    "Kabbalah","Torah","Zohar","Sepher Yetzirah","Tree of Life","Tarot","Alchemy","Hermetic",
    "As Above So Below","Ordo Templi Orientis","Golden Dawn","Rosicrucian","Freemason",
    "Illuminati","Baphomet","Lucifer","Beelzebub","Leviathan","Behemoth","Azazel","Lilith",
  ]],
];

const CATEGORY_OF = new Map<string, string>();
const ALL: CorpusEntry[] = [];
for (const [category, phrases] of RAW) {
  for (const phrase of phrases) {
    const key = normalize(phrase);
    if (!key || CATEGORY_OF.has(key)) continue;
    CATEGORY_OF.set(key, category);
    ALL.push({ phrase, category });
  }
}

// Precomputed cipher → value → entries index.
type Bucket = CorpusEntry[];
type CipherIndex = Map<number, Bucket>;
const INDEX: Record<CipherKey, CipherIndex> = {
  ordinal: new Map(),
  reduction: new Map(),
  reverse: new Map(),
  chaldean: new Map(),
};

for (const entry of ALL) {
  const all = computeAll(entry.phrase);
  (Object.keys(all) as CipherKey[]).forEach((c) => {
    const v = all[c].sum;
    const bucket = INDEX[c].get(v);
    if (bucket) bucket.push(entry);
    else INDEX[c].set(v, [entry]);
  });
}

export interface CorpusMatch extends CorpusEntry {
  source: "bundled";
}

/** Same-cipher lookup: returns bundled corpus entries whose given cipher equals `value`. */
export function findBundledMatches(
  cipher: CipherKey,
  value: number,
  excludeNormalized?: string,
  limit = 50,
): CorpusMatch[] {
  const bucket = INDEX[cipher].get(value);
  if (!bucket) return [];
  const out: CorpusMatch[] = [];
  for (const e of bucket) {
    if (excludeNormalized && normalize(e.phrase) === excludeNormalized) continue;
    out.push({ ...e, source: "bundled" });
    if (out.length >= limit) break;
  }
  return out;
}

export const CORPUS_SIZE = ALL.length;
