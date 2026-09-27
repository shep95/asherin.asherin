/* ══════════════════════════════════════════════════════════════
   VEDIC PREDICTION KNOWLEDGE BASE
   Extracted from: Kapiel Raaj's "Mahadashas @ Speed of Light",
   "Astrology @ Speed of Light", "Aspects @ Speed of Light",
   "Conjunctions @ Speed of Light", and Zophiel Intelligence Reports.
   ══════════════════════════════════════════════════════════════ */

// ── Mahadasha planetary descriptions ──────────────────────────

export interface MahadashaMeaning {
  planet: string;
  years: number;
  personality: string;
  themes: string[];
  positive: string;
  negative: string;
  karakaHouses: number[];
}

export const MAHADASHA_MEANINGS: Record<string, MahadashaMeaning> = {
  Sun: {
    planet: "Sun",
    years: 6,
    personality: "The Sun wants to put you in an authoritative position. Your ego, confidence, and pride surge. You feel drawn to politics, government, and leadership.",
    themes: ["Authority", "Father", "Government", "Self-confidence", "Leadership", "Health", "Politics"],
    positive: "Gain of recognition, fame, connection with government officials, father's support, leadership roles, interest in public service.",
    negative: "Ego clashes, pride causing isolation, father-related issues, health problems (heart/eyes), dominating behavior in relationships.",
    karakaHouses: [1, 10],
  },
  Moon: {
    planet: "Moon",
    years: 10,
    personality: "You become more sensitive, emotional, and closer to home. Issues related to the Mother and creating a family become paramount.",
    themes: ["Emotions", "Mother", "Home", "Travel", "Psychology", "Nurturing", "Family"],
    positive: "Emotional fulfillment, close family bonds, travel opportunities, connection with mother, creative emotional expression, popularity with masses.",
    negative: "Depression, psychological issues, homesickness, emotional instability, suicidal thoughts if Moon is severely damaged, mood swings.",
    karakaHouses: [4],
  },
  Mars: {
    planet: "Mars",
    years: 7,
    personality: "Extremely competitive, aggressive, and technical. You seek to win every opportunity. Discipline rises and you need to take risks.",
    themes: ["Competition", "Brothers", "Real Estate", "Military", "Surgery", "Sports", "Courage"],
    positive: "Victory over enemies, property gains, physical fitness, courage, military/police success, technical mastery, winning competitions.",
    negative: "Anger issues, short fuse, reckless spending, fights with siblings, accidents, surgeries, blood-related issues, quarrels.",
    karakaHouses: [3, 6],
  },
  Rahu: {
    planet: "Rahu",
    years: 18,
    personality: "The planet of misdirection and illusion. You become innovative, original, and want to break rules. Material desires explode. Life feels like driving through dense fog.",
    themes: ["Innovation", "Foreign", "Illusion", "Ambition", "Technology", "Taboo", "Obsession"],
    positive: "Massive material success, innovation, foreign connections, breaking into new fields, sudden windfalls, can make a beggar into a billionaire.",
    negative: "Misdirection, unnecessary fear, extravagance, illegal activities, feeling lost, obsessive behavior, reptile encounters, fog-like existence.",
    karakaHouses: [],
  },
  Jupiter: {
    planet: "Jupiter",
    years: 16,
    personality: "Overly optimistic, philosophical, and like a natural teacher. You feel hopeful, inspired, and want to guide others. Things come easily.",
    themes: ["Wisdom", "Children", "Teaching", "Spirituality", "Expansion", "Marriage", "Higher Education"],
    positive: "Children, marriage, spiritual teachers, academic success, long-distance travel, philosophical knowledge, hopeful outlook, guru encounters.",
    negative: "Over-optimism leading to poor decisions, weight gain, liver issues, being too preachy, blind faith, ignoring practical matters.",
    karakaHouses: [2, 5, 9, 11],
  },
  Saturn: {
    planet: "Saturn",
    years: 19,
    personality: "Mr. Serious Business. Your sense of humor fades. Everything is about practical, realistic approaches. You feel old, mature, and sluggish. Life becomes about duty and service.",
    themes: ["Duty", "Work", "Karma", "Structure", "Government", "Discipline", "Delays"],
    positive: "Career heights, discipline, organizational skills, duty fulfillment, presidency/leadership through hard work, wisdom of an old man.",
    negative: "Fear, anxiety, panic attacks, feeling old, loss of humor, dry/dreary existence, delays, restrictions, loneliness, chronic diseases.",
    karakaHouses: [6, 8, 10, 12],
  },
  Mercury: {
    planet: "Mercury",
    years: 17,
    personality: "Back to optimism after Saturn's grind. You become verbal, eager to learn, and curious. Communication, business, and youthfulness return.",
    themes: ["Communication", "Business", "Education", "Writing", "Sales", "Youth", "Intelligence"],
    positive: "Higher education, writing books, public speaking, sales success, management skills, youthful feeling, networking, adaptability to any situation.",
    negative: "Scattered energy, too many projects, nervous disorders, skin issues, over-thinking, difficulty focusing, speech problems.",
    karakaHouses: [2],
  },
  Ketu: {
    planet: "Ketu",
    years: 7,
    personality: "Isolation, meditation, spirituality, and interest in the occult. You may feel exiled from material wealth and relationships.",
    themes: ["Spirituality", "Occult", "Isolation", "Past Lives", "Research", "Liberation", "Detachment"],
    positive: "Spiritual awakening, psychic abilities, research breakthroughs, occult mastery, past-life knowledge, moksha path, sudden promotion if Ketu is in Raj Yoga.",
    negative: "Isolation, loss of material comforts, relationship breakdown, feeling disconnected, confusion, unusual psychic disturbances.",
    karakaHouses: [],
  },
  Venus: {
    planet: "Venus",
    years: 20,
    personality: "Joyful, playful, passionate. Creativity transforms your life. Even a tax accountant wants to take up crafts. Love, luxury, and beauty become paramount.",
    themes: ["Love", "Marriage", "Luxury", "Art", "Beauty", "Currency", "Passion"],
    positive: "Marriage, artistic pursuits, luxury acquisitions, passionate creativity, currency trading, brand name lifestyle, cultural activities, devotional experiences.",
    negative: "Emptiness without devotion, laziness (princess complex), overspending on luxury, shallow relationships, lacking motivation without passion.",
    karakaHouses: [7],
  },
};

// ── Planet through Houses (Mahadasha predictions) ──────────────

export interface PlanetHousePrediction {
  planet: string;
  house: number;
  prediction: string;
  aspectHouse: number;
  aspectEffect: string;
}

export const SUN_THROUGH_HOUSES: PlanetHousePrediction[] = [
  { planet: "Sun", house: 1, prediction: "Gain of recognition, extreme pride and ego. Father also benefits. Health and self-image become important. You may dominate your spouse and order others around. Interest in politics, government, and temples. Marriage possible if age 18-42.", aspectHouse: 7, aspectEffect: "Dominating partnerships; influencing spouse and business partners through authority." },
  { planet: "Sun", house: 2, prediction: "Attention to family affairs, assets, and father's property. Authoritative speech. Taking over family business or becoming head of banks/financial institutions. Discovering treasure, joint assets with spouse.", aspectHouse: 8, aspectEffect: "Exposing hidden assets, secrets, and tax issues. Father deals with life insurance, wills & estates." },
  { planet: "Sun", house: 3, prediction: "Busy with siblings, sales, marketing. Leadership role in team settings. Short distance travels. Many ego-boosting friends. Taking center stage to announce information.", aspectHouse: 9, aspectEffect: "Authoritative position over father. Wanting to preach like a leader. Ego boost through higher education and philosophy." },
  { planet: "Sun", house: 4, prediction: "Interest in politics, home, mother issues. Ego battles with parents. May shy away from public life or become popular in homeland. Interest in IAS/IPS/military careers.", aspectHouse: 10, aspectEffect: "Sudden interest in government leadership. Taking authority at workplace. Public persona and father's reputation rise." },
  { planet: "Sun", house: 5, prediction: "Focus on children, students, sports, political or entertainment business. Creative expression boosts ego. Interest in political science, history, green energy. May get a son or dominating offspring.", aspectHouse: 11, aspectEffect: "Gains through knowledge. Dominating network circles and elder siblings. Government connections increase investments." },
  { planet: "Sun", house: 6, prediction: "Service-oriented period. Fighting enemies and overcoming obstacles. Interest in medicine, law, or military service. Health awareness. Competitive advantage over enemies.", aspectHouse: 12, aspectEffect: "Expenses on health. Foreign connections through service work. Possible hospitalization or foreign travel." },
  { planet: "Sun", house: 7, prediction: "Marriage and partnerships become the focus. Business partnerships with authoritative figures. Dealing with legal matters and contracts. Public recognition through partnerships.", aspectHouse: 1, aspectEffect: "Partner's influence shapes your identity. Authority figures affect your personality and health." },
  { planet: "Sun", house: 8, prediction: "Transformation period. Dealing with inheritance, joint finances, and in-laws. Interest in occult, research, and investigation. Sudden ups and downs. Tax and insurance matters.", aspectHouse: 2, aspectEffect: "Family wealth affected. Speech becomes intense and transformative. Revealing family secrets." },
  { planet: "Sun", house: 9, prediction: "Higher education, long-distance travel, meeting gurus. Father becomes very important. Religious and philosophical pursuits. Teaching and preaching. Law and academia.", aspectHouse: 3, aspectEffect: "Courage and communication boosted through wisdom. Writing about philosophy or law." },
  { planet: "Sun", house: 10, prediction: "Peak career period. Government positions, authority, fame, recognition. Father's career also benefits. Becoming a leader or CEO. Public service and administrative roles.", aspectHouse: 4, aspectEffect: "Home life affected by career demands. Property through government or authority." },
  { planet: "Sun", house: 11, prediction: "Gains through government, authority figures, and organizations. Fulfillment of desires. Networking with powerful people. Elder siblings benefit. Income from authoritative positions.", aspectHouse: 5, aspectEffect: "Children and creative projects benefit from networks and gains." },
  { planet: "Sun", house: 12, prediction: "Foreign settlement, spiritual retreat, expenses on luxury. Working in hospitals, prisons, or ashrams. Father may travel abroad. Ego dissolution and spiritual growth.", aspectHouse: 6, aspectEffect: "Overcoming enemies through spiritual strength. Health issues require foreign treatment." },
];

export const MOON_THROUGH_HOUSES: PlanetHousePrediction[] = [
  { planet: "Moon", house: 1, prediction: "Emotional and sensitive personality. Close to mother. Public popularity, emotional leadership. Nurturing others. Fluctuating health based on emotions.", aspectHouse: 7, aspectEffect: "Emotional connections in marriage. Spouse is nurturing. Public dealings." },
  { planet: "Moon", house: 2, prediction: "Family-oriented. Emotional about wealth and possessions. Mother's influence on finances. Food business, hospitality. Sweet or emotional speech.", aspectHouse: 8, aspectEffect: "Emotional transformations. Inheritance from maternal side. Psychic experiences." },
  { planet: "Moon", house: 3, prediction: "Creative writing, emotional communication. Close to siblings. Short travels for emotional fulfillment. Media and artistic expression.", aspectHouse: 9, aspectEffect: "Emotional connection to religion and philosophy. Mother as guru figure." },
  { planet: "Moon", house: 4, prediction: "Strong attachment to home and mother. Real estate, vehicles, emotional security. Patriotic feelings. Domestic happiness or turmoil based on Moon's condition.", aspectHouse: 10, aspectEffect: "Career in nurturing fields. Public image shaped by emotions. Work-from-home possibilities." },
  { planet: "Moon", house: 5, prediction: "Creative, romantic period. Love affairs, children, speculation. Emotional intelligence in education. Entertainment and performing arts.", aspectHouse: 11, aspectEffect: "Gains through creativity and children. Emotional fulfillment of desires. Women friends." },
  { planet: "Moon", house: 6, prediction: "Service through nurturing. Health consciousness especially diet. Emotional conflicts with enemies. Caring for the sick. Veterinary or nursing interests.", aspectHouse: 12, aspectEffect: "Emotional expenses. Spiritual retreat for emotional healing. Foreign travel for health." },
  { planet: "Moon", house: 7, prediction: "Marriage and emotional partnerships dominate. Spouse becomes the emotional anchor. Business partnerships with emotional depth. Public dealings.", aspectHouse: 1, aspectEffect: "Partner shapes your emotional identity. Health fluctuates with relationship quality." },
  { planet: "Moon", house: 8, prediction: "Deep emotional transformations. Interest in occult and psychology. Inheritance. Emotional crisis leading to rebirth. Research into hidden subjects.", aspectHouse: 2, aspectEffect: "Family wealth through transformation. Emotional speech. Hidden family matters surface." },
  { planet: "Moon", house: 9, prediction: "Long distance travel, pilgrimage. Mother's spiritual influence. Higher education in humanities. Teaching with emotional depth. Religious devotion.", aspectHouse: 3, aspectEffect: "Courage through faith. Writing about spirituality. Siblings benefit from your wisdom." },
  { planet: "Moon", house: 10, prediction: "Career in public service, nursing, hospitality. Public popularity. Mother's influence on career. Emotional satisfaction through work.", aspectHouse: 4, aspectEffect: "Work affects home life. Career from home. Mother proud of achievements." },
  { planet: "Moon", house: 11, prediction: "Fulfillment of desires through emotional connections. Gains from women. Large social circle. Elder siblings' support. Income from public dealings.", aspectHouse: 5, aspectEffect: "Children bring emotional gains. Creative projects succeed through networks." },
  { planet: "Moon", house: 12, prediction: "Spiritual isolation. Emotional expenses. Foreign residence. Hospital or retreat stays. Vivid dreams and psychic abilities. Mother may be distant.", aspectHouse: 6, aspectEffect: "Health issues with emotional root. Enemies from foreign lands. Service in isolation." },
];

export const MARS_THROUGH_HOUSES: PlanetHousePrediction[] = [
  { planet: "Mars", house: 1, prediction: "Extreme energy and aggression. Sports, military, leadership through force. Physical fitness becomes important. Quick temper but decisive action.", aspectHouse: 7, aspectEffect: "Dominating partnerships. Conflicts in marriage. Spouse may be aggressive." },
  { planet: "Mars", house: 2, prediction: "Aggressive speech. Fighting for family wealth. Property disputes. Banking and finance through competition. Hot/spicy food interests.", aspectHouse: 8, aspectEffect: "Inheritance battles. Joint finance conflicts. Surgical procedures. Insurance matters." },
  { planet: "Mars", house: 3, prediction: "Courage and valor peak. Competition with siblings. Short travels for business. Media, writing, and communication with force.", aspectHouse: 9, aspectEffect: "Aggressive pursuit of higher education. Father conflicts. Religious debates." },
  { planet: "Mars", house: 4, prediction: "Property acquisition, land dealings. Mother's health concerns. Home renovations or building. Engineering and construction interests.", aspectHouse: 10, aspectEffect: "Aggressive career pursuit. Engineering or military career. Authority through technical skill." },
  { planet: "Mars", house: 5, prediction: "Competitive children or students. Sports and athletics. Risky investments. Creative energy channeled through action. Romance with passion.", aspectHouse: 11, aspectEffect: "Gains through competition and sports. Elder siblings may be competitive. Fulfillment through action." },
  { planet: "Mars", house: 6, prediction: "Victory over enemies. Military/police success. Health through exercise. Legal victories. Overcoming obstacles with force.", aspectHouse: 12, aspectEffect: "Expenses on competition. Foreign military service. Hospitalization from injuries." },
  { planet: "Mars", house: 7, prediction: "Passionate but conflicting partnerships. Business with aggression. Legal battles. Spouse may be athletic or in military.", aspectHouse: 1, aspectEffect: "Partner transforms your energy. Health issues from relationship stress." },
  { planet: "Mars", house: 8, prediction: "Major transformation. Surgery, accidents possible. Inheritance battles. Occult and tantra interests. Mining and underground work.", aspectHouse: 2, aspectEffect: "Family wealth through transformation. Aggressive speech. Surgery affecting speech." },
  { planet: "Mars", house: 9, prediction: "Aggressive pursuit of philosophy. Father may be in military. Religious wars and debates. Long travels to conflict zones.", aspectHouse: 3, aspectEffect: "Siblings empowered. Courage in communication. Writing about war or competition." },
  { planet: "Mars", house: 10, prediction: "Peak career in military, engineering, sports, or surgery. Authority through action. Government positions through competitive exams.", aspectHouse: 4, aspectEffect: "Property through career. Home life disrupted by career demands." },
  { planet: "Mars", house: 11, prediction: "Gains through competition. Elder brother benefits. Military or sports organization membership. Desires fulfilled through action.", aspectHouse: 5, aspectEffect: "Children benefit from your gains. Creative competition. Risky investments pay off." },
  { planet: "Mars", house: 12, prediction: "Foreign military service. Expenses on competition. Hospitalization from injuries. Spiritual warrior path. Prison or confinement possible.", aspectHouse: 6, aspectEffect: "Enemies defeated through sacrifice. Health issues from foreign lands." },
];

export const JUPITER_THROUGH_HOUSES: PlanetHousePrediction[] = [
  { planet: "Jupiter", house: 1, prediction: "Wisdom, optimism, and natural teaching ability. Generous personality, weight gain likely. Naturally lucky, protected by divine grace. May become a counselor or advisor.", aspectHouse: 7, aspectEffect: "Blesses marriage and partnerships. Spouse is wise and supportive. Business partnerships protected." },
  { planet: "Jupiter", house: 2, prediction: "Excellent for wealth accumulation, family harmony, and sweet speech. Knowledge of scriptures. Banking, finance, and teaching bring income. Large family.", aspectHouse: 8, aspectEffect: "Protects from sudden dangers. Inheritance and insurance benefits. Interest in mysticism and longevity research." },
  { planet: "Jupiter", house: 3, prediction: "Wise communication, publishing, and teaching siblings. Religious writing. Short travels for spiritual or educational purposes. Courageous in sharing knowledge.", aspectHouse: 9, aspectEffect: "Powerful blessing on fortune house. Father is wise. Higher education flourishes. Pilgrimage and spiritual journeys." },
  { planet: "Jupiter", house: 4, prediction: "Large home, domestic happiness, mother is religious. Academic degrees. Vehicles and property through knowledge. Deep emotional contentment.", aspectHouse: 10, aspectEffect: "Career in education, law, religion, or consulting. Fame through wisdom. Government advisory roles." },
  { planet: "Jupiter", house: 5, prediction: "Excellent for children — wise and successful offspring. Love of learning, speculation gains, creative intelligence. Past-life merit activates. Romance with educated partner.", aspectHouse: 11, aspectEffect: "Gains through education and children. Large friend circle of wise people. Desires fulfilled through knowledge." },
  { planet: "Jupiter", house: 6, prediction: "Overcoming enemies through wisdom. Health consciousness through Ayurveda or natural medicine. Legal victories. Serving the underprivileged through teaching.", aspectHouse: 12, aspectEffect: "Spiritual expenses. Donations to temples. Foreign travel for religious purposes. Liberation path opens." },
  { planet: "Jupiter", house: 7, prediction: "Wise, educated, and supportive spouse. Marriage brings expansion and growth. Business partnerships in education, law, or consulting. Public recognition through partnerships.", aspectHouse: 1, aspectEffect: "Spouse elevates your personality. Health improves through marriage. Wisdom shapes identity." },
  { planet: "Jupiter", house: 8, prediction: "Interest in occult sciences, astrology, and deep research. Inheritance. Long life. Transformation through spiritual knowledge. Insurance and joint finances grow.", aspectHouse: 2, aspectEffect: "Family wealth through hidden knowledge. Speech carries depth and authority. Secret family teachings." },
  { planet: "Jupiter", house: 9, prediction: "The strongest placement — Dharma personified. Father is guru-like. Higher education, law, religion, long travels. Natural teacher and philosopher. Extreme luck and fortune.", aspectHouse: 3, aspectEffect: "Courage through wisdom. Siblings benefit from your luck. Writing about philosophy or religion." },
  { planet: "Jupiter", house: 10, prediction: "Career in education, law, consulting, or religion. CEO or principal of institution. Government advisory roles. Fame and recognition through knowledge.", aspectHouse: 4, aspectEffect: "Property through career success. Mother proud. Academic home environment." },
  { planet: "Jupiter", house: 11, prediction: "Massive gains through networks, elder siblings, and organizations. Desires easily fulfilled. Income from education, consulting, and spiritual services.", aspectHouse: 5, aspectEffect: "Children succeed through your networks. Creative projects funded by organizations." },
  { planet: "Jupiter", house: 12, prediction: "Foreign settlement in prosperous country. Spiritual liberation. Donation and charity work. Teaching in foreign lands. Bedroom pleasures. Dreams carry messages.", aspectHouse: 6, aspectEffect: "Enemies dissolve through spiritual practice. Health maintained through meditation and prayer." },
];

export const SATURN_THROUGH_HOUSES: PlanetHousePrediction[] = [
  { planet: "Saturn", house: 1, prediction: "Serious, disciplined personality. Looks older than age. Slow start in life but eventual mastery. Chronic health issues early but strong constitution later. Government or corporate authority through patience.", aspectHouse: 7, aspectEffect: "Delayed marriage (after 28-30). Spouse is older, mature, or hardworking. Long-lasting marriage if patient." },
  { planet: "Saturn", house: 2, prediction: "Frugal with money. Speech is serious and measured. Family responsibilities weigh heavily. Slow wealth accumulation but very stable. Banking career. Traditional family values.", aspectHouse: 8, aspectEffect: "Longevity. Slow but steady inheritance. Interest in ancient knowledge. Chronic but manageable health issues." },
  { planet: "Saturn", house: 3, prediction: "Hard-working siblings. Communication is slow but precise. Technical or legal writing. Short travels for duty. Courage develops through discipline and repetition.", aspectHouse: 9, aspectEffect: "Father is strict or distant. Delayed higher education but thorough. Traditional religious views." },
  { planet: "Saturn", house: 4, prediction: "Limited domestic happiness early. Mother may be strict or have health issues. Property comes late but is permanent. Deep love for homeland. Government housing.", aspectHouse: 10, aspectEffect: "Massive career through discipline. CEO after years of grinding. Government leadership roles." },
  { planet: "Saturn", house: 5, prediction: "Delayed children. Education requires extra effort. Conservative creativity. Speculation avoided. Romance comes late. Past-life debts with children. Teaching older students.", aspectHouse: 11, aspectEffect: "Gains come slowly but permanently. Old friends. Desires fulfilled after age 36. Stable organizations." },
  { planet: "Saturn", house: 6, prediction: "Excellent for defeating enemies and diseases through discipline. Legal career. Government service. Military discipline. Chronic enemies but you outlast them all. Hard worker.", aspectHouse: 12, aspectEffect: "Expenses controlled through discipline. Foreign travel for work. Structured spiritual practice." },
  { planet: "Saturn", house: 7, prediction: "Delayed marriage. Spouse is hardworking, older, or serious. Business partnerships require patience. Legal career. Marriage improves after initial struggles.", aspectHouse: 1, aspectEffect: "Partner shapes your discipline. Health requires consistent maintenance. Serious demeanor." },
  { planet: "Saturn", house: 8, prediction: "Long life but chronic hidden ailments. Deep interest in ancient texts and occult. Inheritance comes late. Transformation through suffering and patience. Research career.", aspectHouse: 2, aspectEffect: "Family wealth restricted early. Speech becomes measured with age. Financial discipline." },
  { planet: "Saturn", house: 9, prediction: "Father is strict, absent, or has health issues. Higher education delayed but thorough. Traditional religion. Luck comes after age 36. Teaching with authority.", aspectHouse: 3, aspectEffect: "Siblings need help. Communication improves with maturity. Writing about tradition and law." },
  { planet: "Saturn", house: 10, prediction: "DIGBALA — Saturn's strongest position. Massive career success through discipline. CEO, judge, politician, government leader. Authority and respect. Peak comes in 40s-50s.", aspectHouse: 4, aspectEffect: "Property through career. Limited time at home. Mother works hard. Government housing." },
  { planet: "Saturn", house: 11, prediction: "Gains increase with age. Permanent income streams. Old and loyal friends. Elder siblings are hardworking. Organizations and government bring income.", aspectHouse: 5, aspectEffect: "Children are disciplined. Creative success through structure. Education with traditional methods." },
  { planet: "Saturn", house: 12, prediction: "Foreign settlement for work. Expenses on duty and service. Isolation for spiritual practice. Hospital or prison administration. Slow spiritual liberation.", aspectHouse: 6, aspectEffect: "Enemies fear your persistence. Health maintained through routine. Chronic but manageable conditions." },
];

export const MERCURY_THROUGH_HOUSES: PlanetHousePrediction[] = [
  { planet: "Mercury", house: 1, prediction: "Youthful, communicative, and adaptable personality. Quick learner. Multiple talents and interests. Business acumen from birth. Writing and public speaking ability.", aspectHouse: 7, aspectEffect: "Communicative spouse. Business-minded partner. Marriage involves intellectual connection." },
  { planet: "Mercury", house: 2, prediction: "Sweet and persuasive speech. Multiple income sources. Family business. Accounting, banking, and finance. Knowledge of languages. Articulate about money matters.", aspectHouse: 8, aspectEffect: "Research into finances. Insurance calculations. Analytical approach to mysteries." },
  { planet: "Mercury", house: 3, prediction: "Excellent communicator, writer, and media professional. Strong bond with siblings. Short travels for business. Sales and marketing genius. Social media mastery.", aspectHouse: 9, aspectEffect: "Higher education in business or communication. Father is intellectual. Writing about philosophy." },
  { planet: "Mercury", house: 4, prediction: "Home office, working from home. Intellectual mother. Academic environment at home. Real estate business through communication. Multiple vehicles.", aspectHouse: 10, aspectEffect: "Career in communication, media, accounting, or IT. Public speaking brings fame." },
  { planet: "Mercury", house: 5, prediction: "Intelligent children. Educational achievements. Creative writing and performing arts. Speculation through analysis. Love through intellectual connection.", aspectHouse: 11, aspectEffect: "Gains through intellect and communication. Networking genius. Multiple friend groups." },
  { planet: "Mercury", house: 6, prediction: "Analytical problem-solver. Defeating enemies through intelligence. Health through analysis and awareness. Legal analysis. Accounting and auditing success.", aspectHouse: 12, aspectEffect: "Foreign connections through communication. Expenses on education. Mental health awareness." },
  { planet: "Mercury", house: 7, prediction: "Business partnerships and trade. Spouse is intellectual, younger, or in business. Multiple business ventures. Legal contracts and negotiations.", aspectHouse: 1, aspectEffect: "Partner sharpens your intellect. Business shapes identity. Youthful appearance through relationships." },
  { planet: "Mercury", house: 8, prediction: "Research and investigation talent. Accounting of hidden finances. Occult calculation and astrology. Insurance and tax expertise. Secretive communication.", aspectHouse: 2, aspectEffect: "Family wealth through research. Analytical speech. Hidden knowledge of finances." },
  { planet: "Mercury", house: 9, prediction: "Higher education in commerce, communication, or law. Father is intellectual. Teaching and publishing. International trade and commerce. Philosophical writing.", aspectHouse: 3, aspectEffect: "Siblings benefit from your education. Courageous communication. Media and publishing." },
  { planet: "Mercury", house: 10, prediction: "Career in IT, accounting, writing, journalism, or business management. Public communication. Government administration. Multiple career changes.", aspectHouse: 4, aspectEffect: "Working from home. Intellectual mother. Property through business deals." },
  { planet: "Mercury", house: 11, prediction: "Gains through intellect, business, and communication. Large social network. Multiple income streams. Elder siblings are intellectual. Networking mastery.", aspectHouse: 5, aspectEffect: "Children are intelligent. Educational gains. Creative projects funded by networks." },
  { planet: "Mercury", house: 12, prediction: "Foreign communication and business. Writing in isolation. Working behind the scenes. IT and remote work. Dreams carry intellectual messages.", aspectHouse: 6, aspectEffect: "Enemies defeated through analysis. Health maintained through awareness. Legal solutions." },
];

export const VENUS_THROUGH_HOUSES: PlanetHousePrediction[] = [
  { planet: "Venus", house: 1, prediction: "Beautiful, charming, and attractive personality. Love of luxury and arts. Magnetic presence. Fashion sense. Early marriage potential. Creative self-expression.", aspectHouse: 7, aspectEffect: "Beautiful and loving spouse. Marriage brings luxury. Strong partnership with mutual attraction." },
  { planet: "Venus", house: 2, prediction: "Wealth through beauty, arts, and luxury items. Sweet and melodious speech. Family values beauty. Jewelry, cosmetics, and food business. Singing voice.", aspectHouse: 8, aspectEffect: "Hidden wealth through spouse. Joint finances grow through luxury investments. Beauty survives transformation." },
  { planet: "Venus", house: 3, prediction: "Creative communication, artistic media, writing romance novels. Fashion blogging. Beautiful siblings. Short travels for pleasure and art exhibitions.", aspectHouse: 9, aspectEffect: "Higher education in arts. Father appreciates beauty. Travel for cultural experiences." },
  { planet: "Venus", house: 4, prediction: "Beautiful home, luxury vehicles, domestic happiness. Mother is beautiful. Interior design. Real estate in upscale areas. Emotional satisfaction through comfort.", aspectHouse: 10, aspectEffect: "Career in arts, fashion, entertainment, or luxury brands. Public admiration for aesthetic sense." },
  { planet: "Venus", house: 5, prediction: "Romance, love affairs, and creative expression peak. Beautiful children. Entertainment industry. Speculation in luxury markets. Past-life artistic merit.", aspectHouse: 11, aspectEffect: "Gains through creativity and romance. Beautiful friend circle. Desires fulfilled through art." },
  { planet: "Venus", house: 6, prediction: "Service through beauty — cosmetics, fashion for masses. Health through beauty treatments. Defeating enemies with charm. Pets are beautiful.", aspectHouse: 12, aspectEffect: "Luxury expenses. Foreign travel for pleasure. Bedroom pleasures. Spiritual devotion through beauty." },
  { planet: "Venus", house: 7, prediction: "BEST placement for marriage. Beautiful, artistic, loving spouse. Business in luxury, beauty, and fashion. Strong partnerships. Public admiration for couple.", aspectHouse: 1, aspectEffect: "Spouse defines your beauty. Identity shaped by love. Attractive and charming personality." },
  { planet: "Venus", house: 8, prediction: "Hidden beauty and sensuality. Inheritance of luxury items. Occult through art and music. Tantric knowledge. Transformation through love. Joint wealth grows.", aspectHouse: 2, aspectEffect: "Family wealth through marriage. Sweet but secretive speech. Hidden talents in arts." },
  { planet: "Venus", house: 9, prediction: "Love for philosophy and culture. Beautiful father or father loves beauty. Higher education in arts. Travel to beautiful places. Devotional music and dance.", aspectHouse: 3, aspectEffect: "Creative courage. Artistic siblings. Communication through beauty and art." },
  { planet: "Venus", house: 10, prediction: "Career in entertainment, fashion, beauty industry, or luxury brands. Public figure in arts. Diplomatic career. Hotel and hospitality management.", aspectHouse: 4, aspectEffect: "Beautiful home through career success. Luxury vehicles. Mother benefits from your fame." },
  { planet: "Venus", house: 11, prediction: "Gains through beauty, arts, and women. Large and beautiful social circle. Income from entertainment and luxury. Elder sister benefits. Desires for beauty fulfilled.", aspectHouse: 5, aspectEffect: "Romantic gains. Beautiful children. Creative projects bring income." },
  { planet: "Venus", house: 12, prediction: "Foreign residence in beautiful country. Luxury expenses. Bedroom pleasures maximized. Spiritual devotion through art and beauty. Secret love affairs possible.", aspectHouse: 6, aspectEffect: "Enemies charmed into submission. Health maintained through beauty and comfort. Service with grace." },
];

export const RAHU_THROUGH_HOUSES: PlanetHousePrediction[] = [
  { planet: "Rahu", house: 1, prediction: "Obsessive self-image. Unconventional personality. Foreign appearance or lifestyle. Innovation and rule-breaking. Can achieve massive fame but identity confusion. Smoke-and-mirrors personality.", aspectHouse: 7, aspectEffect: "Foreign or unconventional spouse. Obsessive partnerships. Business with foreigners." },
  { planet: "Rahu", house: 2, prediction: "Obsession with wealth. Unconventional speech or accent. Foreign food and languages. Can make massive wealth through illusion and innovation. Family secrets.", aspectHouse: 8, aspectEffect: "Hidden wealth explosion. Insurance and inheritance through unconventional means. Occult obsession." },
  { planet: "Rahu", house: 3, prediction: "Media obsession. Viral content creator. Unconventional communication. Foreign media connections. Technology in communication. Bold and fearless expression.", aspectHouse: 9, aspectEffect: "Breaking religious traditions. Foreign gurus. Higher education in technology or innovation." },
  { planet: "Rahu", house: 4, prediction: "Foreign property or unconventional home. Technology at home. Mother is unconventional. Obsession with domestic security. Luxury vehicles through illusion.", aspectHouse: 10, aspectEffect: "Career in technology, innovation, or foreign companies. Sudden fame. Unconventional career path." },
  { planet: "Rahu", house: 5, prediction: "Obsessive love affairs. Unconventional children. Innovation in education. Speculation in technology stocks. Past-life foreign karma. Entertainment obsession.", aspectHouse: 11, aspectEffect: "Massive gains through technology and innovation. Foreign networks. Unconventional income streams." },
  { planet: "Rahu", house: 6, prediction: "Victory over enemies through cunning. Unconventional health treatments. Foreign diseases or foreign doctors. Legal manipulation. Immune system anomalies.", aspectHouse: 12, aspectEffect: "Foreign expenses. Obsessive spiritual seeking. Technology in foreign lands." },
  { planet: "Rahu", house: 7, prediction: "Foreign spouse. Obsessive love and partnerships. Business with foreigners. Unconventional marriage. Multiple relationships possible. Public obsession.", aspectHouse: 1, aspectEffect: "Foreign partner shapes your identity. Unconventional self-image through relationships." },
  { planet: "Rahu", house: 8, prediction: "Deep obsession with occult and hidden knowledge. Sudden transformation. Foreign inheritance. Technology in research. Can bring sudden windfalls or losses.", aspectHouse: 2, aspectEffect: "Family wealth through hidden and foreign sources. Unusual speech patterns. Secret finances." },
  { planet: "Rahu", house: 9, prediction: "Breaking religious traditions. Foreign gurus and teachers. Unconventional higher education. Technology in religion. Father is foreign or unconventional.", aspectHouse: 3, aspectEffect: "Fearless communication. Media innovation. Siblings involved in foreign affairs." },
  { planet: "Rahu", house: 10, prediction: "Massive career through technology and innovation. Foreign companies. Unconventional authority. Sudden rise to fame. Can become a mogul but with instability.", aspectHouse: 4, aspectEffect: "Foreign property. Technology at home. Mother may live abroad." },
  { planet: "Rahu", house: 11, prediction: "BEST placement — massive gains, fulfilled desires, huge networks. Income through technology, foreign sources, and innovation. Elder siblings abroad.", aspectHouse: 5, aspectEffect: "Speculative gains through technology. Children may be abroad. Unconventional creativity." },
  { planet: "Rahu", house: 12, prediction: "Foreign settlement guaranteed. Obsession with spirituality. Spending on foreign travel. Can achieve moksha through unconventional paths. Vivid and prophetic dreams.", aspectHouse: 6, aspectEffect: "Foreign enemies but also foreign victories. Health issues from abroad. Unconventional healing." },
];

export const KETU_THROUGH_HOUSES: PlanetHousePrediction[] = [
  { planet: "Ketu", house: 1, prediction: "Detached from physical body. Spiritual and mystical personality. Past-life wisdom visible. Unusual appearance. Psychic abilities. Disconnection from material self.", aspectHouse: 7, aspectEffect: "Detachment from marriage. Spiritual spouse or no marriage interest. Past-life partnership karma." },
  { planet: "Ketu", house: 2, prediction: "Detached from family wealth. Speech may be unusual or minimal. Past-life knowledge of languages. Family traditions disrupted. Sudden financial changes.", aspectHouse: 8, aspectEffect: "Past-life occult mastery. Sudden transformations feel familiar. Detachment from joint finances." },
  { planet: "Ketu", house: 3, prediction: "Past-life communication mastery. Minimal effort in writing and media. Detachment from siblings. Spiritual courage. Research-oriented communication.", aspectHouse: 9, aspectEffect: "Past-life religious mastery. Already knows philosophy. Father may be spiritually advanced." },
  { planet: "Ketu", house: 4, prediction: "Detachment from home and motherland. Past-life comfort already experienced. May lose property or home. Mother is spiritual. Inner peace through detachment.", aspectHouse: 10, aspectEffect: "Detachment from career ambitions. Past-life authority. Spiritual work over material career." },
  { planet: "Ketu", house: 5, prediction: "Past-life children karma. Detachment from romance. Deep meditation and mantras. Spiritual education. Past-life merit returns as sudden intuition.", aspectHouse: 11, aspectEffect: "Detachment from material gains. Spiritual networks. Past-life desires already fulfilled." },
  { planet: "Ketu", house: 6, prediction: "Excellent for spiritual victory over enemies. Past-life service mastery. Health through alternative medicine. Karmic debts from enemies clear. Pets from past life.", aspectHouse: 12, aspectEffect: "Natural moksha path. Past-life liberation practice continues. Minimal expenses needed." },
  { planet: "Ketu", house: 7, prediction: "Detachment from marriage and business partnerships. Spouse is spiritual or unusual. Past-life marriage karma resolves. May not marry or marry unconventionally.", aspectHouse: 1, aspectEffect: "Spiritual identity. Past-life personality traits emerge. Detachment from physical appearance." },
  { planet: "Ketu", house: 8, prediction: "EXCELLENT — past-life occult mastery. Natural psychic and healer. Sudden spiritual breakthroughs. Detachment from death fear. Research genius.", aspectHouse: 2, aspectEffect: "Detachment from family wealth. Spiritual speech. Past-life languages emerge." },
  { planet: "Ketu", house: 9, prediction: "Already spiritually advanced from past life. Detachment from organized religion. Father may be absent or spiritual. Natural philosopher without formal education.", aspectHouse: 3, aspectEffect: "Past-life communication skills. Effortless courage. Minimal effort in media work." },
  { planet: "Ketu", house: 10, prediction: "Detachment from career and status. Past-life authority. May leave career for spiritual pursuits. Sudden promotion if Ketu well-placed. Government spiritual advisory.", aspectHouse: 4, aspectEffect: "Detachment from home. Past-life property. Mother is spiritual or detached." },
  { planet: "Ketu", house: 11, prediction: "Detachment from material gains and large networks. Past-life desires already fulfilled. Spiritual organizations. Elder siblings are spiritual.", aspectHouse: 5, aspectEffect: "Past-life children karma. Detachment from romance. Meditation over speculation." },
  { planet: "Ketu", house: 12, prediction: "MOKSHA placement — natural path to liberation. Extreme spiritual abilities. Past-life enlightenment continues. Foreign spiritual retreats. Dreams carry divine messages.", aspectHouse: 6, aspectEffect: "Enemies from past life disappear. Health through meditation. Karmic debts cleared." },
];

// All planet house predictions consolidated
export const PLANET_HOUSE_PREDICTIONS: Record<string, PlanetHousePrediction[]> = {
  Sun: SUN_THROUGH_HOUSES,
  Moon: MOON_THROUGH_HOUSES,
  Mars: MARS_THROUGH_HOUSES,
  Jupiter: JUPITER_THROUGH_HOUSES,
  Saturn: SATURN_THROUGH_HOUSES,
  Mercury: MERCURY_THROUGH_HOUSES,
  Venus: VENUS_THROUGH_HOUSES,
  Rahu: RAHU_THROUGH_HOUSES,
  Ketu: KETU_THROUGH_HOUSES,
};

// ── Planetary Aspects ────────────────────────────────────────

export const ASPECT_RULES: Record<string, number[]> = {
  Sun: [7],
  Moon: [7],
  Mercury: [7],
  Venus: [7],
  Mars: [4, 7, 8],
  Jupiter: [5, 7, 9],
  Saturn: [3, 7, 10],
  Rahu: [5, 7, 9],
  Ketu: [5, 7, 9],
};

export const ASPECT_MEANINGS: Record<string, string> = {
  Sun: "Gives authoritative direction and responsibility upon the aspected house.",
  Moon: "Gives comfort, emotional nurturing, and welcoming nature to the aspected house.",
  Mercury: "Creates communication, networking, and analytical engagement with the aspected house.",
  Venus: "Brings desire, pleasure, beauty, and happiness to the aspected house.",
  Mars: "Creates direct, aggressive action and competitive energy toward the aspected house.",
  Jupiter: "Blesses and protects the aspected house. Neutralizes negative results. Expands growth and wisdom.",
  Saturn: "Brings focus, discipline, fear, anxiety, and responsibility to the aspected house. Most important aspect.",
  Rahu: "Creates obsession, foreign elements, expansion, and illusion upon the aspected house.",
  Ketu: "Creates separation, detachment, and past-life mastery toward the aspected house.",
};

// ── Conjunction Meanings ─────────────────────────────────────

export interface ConjunctionMeaning {
  planets: [string, string];
  meaning: string;
  effect: string;
}

export const CONJUNCTION_MEANINGS: ConjunctionMeaning[] = [
  { planets: ["Sun", "Moon"], meaning: "Amavasya Yoga (New Moon)", effect: "Mind and soul merge. Strong personality but possible ego-emotion conflict. Father and mother themes intertwined. Can struggle with identity if afflicted." },
  { planets: ["Sun", "Mercury"], meaning: "Budha-Aditya Yoga", effect: "Sharp intelligence, communication skills, potential for leadership through intellect. If Mercury is combust (<14°), communication suffers. Business acumen." },
  { planets: ["Sun", "Venus"], meaning: "Combust Venus if close", effect: "Passionate about art and beauty. Relationships with authority figures. Father connected to arts. If combust, love life suffers." },
  { planets: ["Sun", "Mars"], meaning: "Fire conjunction", effect: "Extreme aggression, leadership through force. Military, police, or government. Father may be aggressive. Hot temper but decisive." },
  { planets: ["Sun", "Jupiter"], meaning: "Guru-Aditya Yoga", effect: "Wisdom through authority. Father is like a guru. Government positions through wisdom. Teaching and spiritual leadership." },
  { planets: ["Sun", "Saturn"], meaning: "Father-Son conflict", effect: "Conflict between authority and duty. Father issues. Delayed recognition but eventual authority. Government work with restrictions." },
  { planets: ["Sun", "Rahu"], meaning: "Eclipse of ego", effect: "Unconventional authority. Foreign government connections. Father may be unusual. Obsession with power and status." },
  { planets: ["Sun", "Ketu"], meaning: "Ego dissolution", effect: "Spiritual authority. Detached from fame. Past-life leadership karma. Father may be spiritual or absent." },
  { planets: ["Moon", "Mars"], meaning: "Chandra-Mangal Yoga", effect: "Wealth through emotional action. Real estate success. Mother is strong. Emotional intensity in action. Can cause anger issues." },
  { planets: ["Moon", "Mercury"], meaning: "Mental agility", effect: "Quick thinking, witty communication. Business mind with emotional intelligence. Writing and media success. Can cause nervousness." },
  { planets: ["Moon", "Venus"], meaning: "Luxury and beauty", effect: "Love of beauty, art, and luxury. Emotional satisfaction through relationships. Mother is beautiful. Creative arts, music, poetry." },
  { planets: ["Moon", "Jupiter"], meaning: "Gajakesari Yoga", effect: "One of the greatest yogas. Wisdom through emotions. Famous, wealthy, and wise. Great memory and teaching ability. Mother is spiritual." },
  { planets: ["Moon", "Saturn"], meaning: "Emotional restriction", effect: "Depression, emotional coldness. Delayed motherhood. Mother may suffer. Hard work through emotional discipline. Vairagya yoga." },
  { planets: ["Moon", "Rahu"], meaning: "Grahan Yoga", effect: "Psychological disturbance, unusual mother. Foreign residence. Obsessive emotional patterns. Mental health awareness needed." },
  { planets: ["Moon", "Ketu"], meaning: "Spiritual emotions", effect: "Psychic abilities, past-life emotional memories. Detachment from mother. Spiritual intuition. Can cause emptiness." },
  { planets: ["Venus", "Mercury"], meaning: "Artist-Communicator", effect: "Creative communication, media, writing romance. Business in arts. Fashion, design, beauty products. Social media success." },
  { planets: ["Venus", "Mars"], meaning: "Passionate love", effect: "Intense romance, sexual energy. Dance, sports, and competitive arts. Passionate marriage but possible conflicts." },
  { planets: ["Venus", "Jupiter"], meaning: "Grand benefic", effect: "Great wealth, wisdom in love. Teaching arts. Spiritual devotion through beauty. Excellent for marriage and children." },
  { planets: ["Venus", "Saturn"], meaning: "Disciplined love", effect: "Delayed but lasting marriage. Hard work in arts. Older spouse or delayed romance. Film industry, fashion with structure." },
  { planets: ["Venus", "Rahu"], meaning: "Obsessive love", effect: "Unconventional relationships, foreign spouse. Obsession with luxury. Celebrity potential. Taboo relationships possible." },
  { planets: ["Venus", "Ketu"], meaning: "Detached love", effect: "Past-life love karma. Spiritual love. Detachment from material beauty. Healing through divine love." },
  { planets: ["Mars", "Jupiter"], meaning: "Dharma warrior", effect: "Righteous action, military leadership, sports coaching. Law enforcement. Protector of dharma. Real estate wealth." },
  { planets: ["Mars", "Saturn"], meaning: "Controlled fire", effect: "Disciplined aggression. Engineering, construction. Delayed action but lasting results. Military discipline. Can cause accidents." },
  { planets: ["Mars", "Rahu"], meaning: "Angarak Yoga", effect: "Explosive energy, accidents, sudden violence. Military innovation. Technology aggression. Must control anger." },
  { planets: ["Mars", "Ketu"], meaning: "Spiritual warrior", effect: "Past-life military karma. Detachment through action. Surgery skills. Occult through action." },
  { planets: ["Jupiter", "Saturn"], meaning: "Brahma Yoga", effect: "Wisdom through discipline. Great teachers, professors. Balanced expansion and restriction. Long-lasting success through patience." },
  { planets: ["Jupiter", "Rahu"], meaning: "Guru Chandal Yoga", effect: "Unconventional wisdom. Breaking religious rules. Foreign gurus. Can either elevate or corrupt spiritual path." },
  { planets: ["Jupiter", "Ketu"], meaning: "Moksha yoga", effect: "Spiritual liberation, past-life wisdom. Detachment from material expansion. Great for astrology and occult studies." },
  { planets: ["Saturn", "Rahu"], meaning: "Shrapit Yoga", effect: "Past-life curse activation. Extreme delays and frustration. Foreign hardship. Must serve to break karma. When resolved, massive transformation." },
  { planets: ["Saturn", "Ketu"], meaning: "Karmic completion", effect: "End of karmic cycle. Extreme isolation and spiritual practice. Detachment from worldly duty. Moksha indicator." },
];

// ── House Meanings ───────────────────────────────────────────

export const HOUSE_MEANINGS: Record<number, { name: string; themes: string[]; karaka: string }> = {
  1: { name: "Lagna (Self)", themes: ["Personality", "Health", "Appearance", "Ego", "Life Direction"], karaka: "Sun" },
  2: { name: "Dhana (Wealth)", themes: ["Family", "Speech", "Savings", "Food", "Death", "Face"], karaka: "Jupiter/Mercury" },
  3: { name: "Sahaja (Courage)", themes: ["Siblings", "Communication", "Short Travel", "Skills", "Effort", "Media"], karaka: "Mars" },
  4: { name: "Sukha (Happiness)", themes: ["Mother", "Home", "Property", "Vehicles", "Education", "Comfort"], karaka: "Moon" },
  5: { name: "Putra (Children)", themes: ["Children", "Education", "Romance", "Creativity", "Past-Life Merit", "Speculation"], karaka: "Jupiter" },
  6: { name: "Shatru (Enemies)", themes: ["Enemies", "Disease", "Debt", "Service", "Daily Routine", "Pets"], karaka: "Mars/Saturn" },
  7: { name: "Kalatra (Marriage)", themes: ["Marriage", "Business Partner", "Contracts", "Court", "Public", "Foreign Travel"], karaka: "Venus" },
  8: { name: "Randhra (Transformation)", themes: ["Death", "Occult", "Inheritance", "Sudden Events", "Research", "In-Laws"], karaka: "Saturn" },
  9: { name: "Dharma (Fortune)", themes: ["Father", "Guru", "Higher Education", "Long Travel", "Religion", "Law", "Fortune"], karaka: "Jupiter" },
  10: { name: "Karma (Career)", themes: ["Career", "Authority", "Fame", "Government", "Status", "Public Life"], karaka: "Sun/Saturn" },
  11: { name: "Labha (Gains)", themes: ["Gains", "Friends", "Elder Siblings", "Organizations", "Desires", "Income"], karaka: "Jupiter" },
  12: { name: "Vyaya (Loss)", themes: ["Foreign Lands", "Spirituality", "Expenses", "Isolation", "Liberation", "Dreams"], karaka: "Saturn" },
};

// ── Soulmate / Marriage Indicators ───────────────────────────

export interface MarriageIndicator {
  condition: string;
  prediction: string;
  timing: string;
}

export const MARRIAGE_INDICATORS: MarriageIndicator[] = [
  { condition: "Venus in 7th house", prediction: "Beautiful, artistic spouse. Marriage brings luxury and comfort. Strong partnership.", timing: "Venus Mahadasha or Antardasha" },
  { condition: "Jupiter aspects 7th house", prediction: "Blessed marriage. Spouse is wise, supportive, and brings growth. Protected from divorce.", timing: "Jupiter Dasha periods" },
  { condition: "7th lord in 1st house", prediction: "Spouse comes to you. Strong attraction. Partner dominates personality. Business partnerships.", timing: "Dasha of 7th lord" },
  { condition: "7th lord in 5th house", prediction: "Love marriage. Romance leads to partnership. Creative spouse. Children bring couple together.", timing: "Dasha of 5th or 7th lord" },
  { condition: "7th lord in 9th house", prediction: "Spouse from different culture or religion. Meeting through higher education or travel. Father helps in marriage.", timing: "Dasha of 9th lord" },
  { condition: "Venus conjunct Moon", prediction: "Deep emotional love. Soulmate connection. Beautiful and nurturing partner.", timing: "Venus or Moon Dasha" },
  { condition: "Saturn aspects 7th", prediction: "Delayed marriage but lasting. Older or mature spouse. Marriage after 28-30.", timing: "Saturn Dasha/Antardasha" },
  { condition: "Rahu in 7th house", prediction: "Foreign or unconventional spouse. Obsessive love. Non-traditional marriage.", timing: "Rahu Dasha" },
];

// ── Wealth Indicators (from Indu Lagna and patterns) ─────────

export const INDU_LAGNA_RAYS: Record<string, number> = {
  Sun: 30,
  Moon: 16,
  Mars: 6,
  Mercury: 8,
  Jupiter: 10,
  Venus: 12,
  Saturn: 1,
};

export interface WealthPrediction {
  condition: string;
  prediction: string;
  level: "multi-millionaire" | "wealthy" | "comfortable" | "struggling";
}

export const WEALTH_PREDICTIONS: WealthPrediction[] = [
  { condition: "Benefics in Indu Lagna", prediction: "Multi-millionaire status. Jupiter, Venus, Mercury, or Full Moon in Indu Lagna brings massive financial expansion.", level: "multi-millionaire" },
  { condition: "Malefics in Indu Lagna", prediction: "Wealth through unconventional means — black market, coercion, or hidden sources.", level: "wealthy" },
  { condition: "Jupiter transits Indu Lagna", prediction: "The 'Golden Period' — massive financial expansion when Jupiter transits your Indu Lagna sign.", level: "multi-millionaire" },
  { condition: "2nd lord strong", prediction: "Good family wealth, savings, and speech that attracts money. Banking and financial success.", level: "wealthy" },
  { condition: "11th lord strong", prediction: "Gains from organizations, networks, and elder siblings. Income streams multiply.", level: "comfortable" },
  { condition: "Saturn in 10th", prediction: "Career success through hard work and discipline. Government or corporate leadership.", level: "wealthy" },
];

// ── Day vs Night Birth ───────────────────────────────────────

export interface BirthTimeStrength {
  period: string;
  strongPlanets: string[];
  description: string;
}

export const BIRTH_TIME_STRENGTHS: BirthTimeStrength[] = [
  { period: "Day (6am-6pm)", strongPlanets: ["Sun", "Venus", "Jupiter"], description: "Sun, Venus, and Jupiter naturally gain strength. Even debilitated, they find inner power to rise." },
  { period: "Night (7pm-4am)", strongPlanets: ["Moon", "Mars", "Saturn"], description: "Moon, Mars, and Saturn naturally gain strength. Night-born people must work harder on confidence (Sun weaker)." },
  { period: "Sunrise/Sunset", strongPlanets: ["Mercury"], description: "Mercury gains natural strength during transitional times, matching its dual nature of change." },
];

// ── Gandanta Points (Karmic Knots) ───────────────────────────

export interface GandantaKnot {
  junction: string;
  nakshatras: [string, string];
  degrees: string;
  meaning: string;
  effect: string;
}

export const GANDANTA_KNOTS: GandantaKnot[] = [
  { junction: "Pisces-Aries", nakshatras: ["Revati", "Ashwini"], degrees: "29°12' Pisces – 0°48' Aries", meaning: "The Knot of Ending", effect: "Completion of the soul's cycle. Letting go of the universal to start the individual ego. Planets here function like 'drowning' planets — unsolvable psychological complexes forcing spiritual practice." },
  { junction: "Cancer-Leo", nakshatras: ["Ashlesha", "Magha"], degrees: "29°12' Cancer – 0°48' Leo", meaning: "The Knot of Ego", effect: "Transition from emotional insecurity to finding one's power. Deep identity crisis that resolves through self-discovery." },
  { junction: "Scorpio-Sagittarius", nakshatras: ["Jyeshta", "Mula"], degrees: "29°12' Scorpio – 0°48' Sagittarius", meaning: "The Knot of Spiritual Truth", effect: "The most difficult knot. Moving from deep occult churning to the root of truth. Only spiritual remedies work here — material remedies fail." },
];

// ── Atmakaraka Teachings ─────────────────────────────────────

export interface AtmakarakaLesson {
  planet: string;
  house: number;
  lesson: string;
  prediction: string;
}

export const ATMAKARAKA_LESSONS: AtmakarakaLesson[] = [
  { planet: "Venus", house: 9, lesson: "Learning to become a strategist and reviving ancestral traditions", prediction: "Benefits from father's money/advice. Must revive something in lineage — family traditions, ancestral worship. Becomes a great teacher, consultant, and strategist. Best education possible (Ivy League if with Sun). Luck belongs to spouse." },
  { planet: "Venus", house: 11, lesson: "Fulfilling desires and sharing love with community", prediction: "Must fulfill desires from past lives. A woman in your life is key to success. Retrograde Venus here = activist or humanitarian. When wife enters life, clarity and path become visible. Money increases when fulfilling small authentic desires." },
  { planet: "Venus", house: 12, lesson: "Surrender to the divine and serving the spouse", prediction: "The soul has already experienced the best marriage in past life. This life is for finishing small karmas. Marriage is essential for spiritual progress. Spending on spouse brings wealth back. Past relationships revive. Tremendous luxury possible but emptiness without surrender to divine." },
  { planet: "Mars", house: 2, lesson: "Taking responsibility for family and finances", prediction: "Must take care of family finances before personal desires. People come for financial help. After age 28, true maturity of this placement emerges. Financial responsibility becomes soul's primary duty." },
];

// ── Sign Lords (for house rulership) ─────────────────────────

export const SIGN_LORDS: Record<number, string> = {
  0: "Mars",      // Aries
  1: "Venus",     // Taurus
  2: "Mercury",   // Gemini
  3: "Moon",      // Cancer
  4: "Sun",       // Leo
  5: "Mercury",   // Virgo
  6: "Venus",     // Libra
  7: "Mars",      // Scorpio
  8: "Jupiter",   // Sagittarius
  9: "Saturn",    // Capricorn
  10: "Saturn",   // Aquarius
  11: "Jupiter",  // Pisces
};

export const SIGN_NAMES = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

// ── Functional Benefic/Malefic by Ascendant ──────────────────

export const FUNCTIONAL_ROLES_BY_LAGNA: Record<number, { benefics: string[]; malefics: string[]; yogakaraka: string | null }> = {
  0: { benefics: ["Sun", "Jupiter", "Mars"], malefics: ["Mercury", "Rahu", "Ketu"], yogakaraka: null }, // Aries
  1: { benefics: ["Saturn", "Mercury", "Venus"], malefics: ["Jupiter", "Moon", "Mars"], yogakaraka: "Saturn" }, // Taurus
  2: { benefics: ["Venus", "Saturn"], malefics: ["Mars", "Jupiter", "Sun"], yogakaraka: null }, // Gemini
  3: { benefics: ["Moon", "Mars", "Jupiter"], malefics: ["Saturn", "Venus", "Mercury"], yogakaraka: "Mars" }, // Cancer
  4: { benefics: ["Sun", "Mars", "Jupiter"], malefics: ["Saturn", "Venus", "Mercury"], yogakaraka: "Mars" }, // Leo
  5: { benefics: ["Mercury", "Venus"], malefics: ["Mars", "Moon", "Jupiter"], yogakaraka: null }, // Virgo
  6: { benefics: ["Venus", "Saturn", "Mercury"], malefics: ["Sun", "Mars", "Jupiter"], yogakaraka: "Saturn" }, // Libra
  7: { benefics: ["Moon", "Jupiter", "Sun"], malefics: ["Mercury", "Venus", "Saturn"], yogakaraka: null }, // Scorpio
  8: { benefics: ["Jupiter", "Mars", "Sun"], malefics: ["Venus", "Saturn", "Mercury"], yogakaraka: null }, // Sagittarius
  9: { benefics: ["Saturn", "Venus", "Mercury"], malefics: ["Mars", "Moon", "Jupiter"], yogakaraka: "Venus" }, // Capricorn
  10: { benefics: ["Saturn", "Venus"], malefics: ["Moon", "Mars", "Jupiter"], yogakaraka: "Venus" }, // Aquarius
  11: { benefics: ["Jupiter", "Moon", "Mars"], malefics: ["Sun", "Mercury", "Venus"], yogakaraka: null }, // Pisces
};
