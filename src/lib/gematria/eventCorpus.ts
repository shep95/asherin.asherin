// Bundled corpus of notable dated historical events.
// Each entry is small — { d: ISO date, t: title, c: category, s: source }
// Used by the resonance engine to surface historical echoes for any phrase.
// Not a mystical claim — this is a statistical collision search across
// well-known dates. Categories: war, market, tech, disaster, politics,
// space, treaty, cultural, assassination, discovery.

export interface DatedEvent {
  d: string; // YYYY-MM-DD (UTC)
  t: string;
  c: string;
  s?: string;
}

export const DATED_EVENTS: DatedEvent[] = [
  // 19th century turning points
  { d: "1859-11-24", t: "Origin of Species published", c: "discovery" },
  { d: "1865-04-14", t: "Lincoln assassinated", c: "assassination" },
  { d: "1869-05-10", t: "Transcontinental Railroad completed", c: "tech" },
  { d: "1876-03-10", t: "First telephone call", c: "tech" },
  { d: "1889-05-06", t: "Eiffel Tower opens", c: "cultural" },

  // Early 20th
  { d: "1903-12-17", t: "Wright brothers first flight", c: "tech" },
  { d: "1912-04-15", t: "Titanic sinks", c: "disaster" },
  { d: "1914-06-28", t: "Franz Ferdinand assassinated", c: "assassination" },
  { d: "1914-07-28", t: "WWI begins", c: "war" },
  { d: "1917-11-07", t: "October Revolution", c: "politics" },
  { d: "1918-11-11", t: "WWI armistice", c: "war" },
  { d: "1919-06-28", t: "Treaty of Versailles", c: "treaty" },
  { d: "1927-05-21", t: "Lindbergh crosses Atlantic", c: "tech" },
  { d: "1929-10-24", t: "Black Thursday crash", c: "market" },
  { d: "1929-10-29", t: "Black Tuesday — Wall Street Crash", c: "market" },
  { d: "1933-01-30", t: "Hitler becomes Chancellor", c: "politics" },
  { d: "1939-09-01", t: "Germany invades Poland — WWII begins", c: "war" },
  { d: "1941-12-07", t: "Pearl Harbor attack", c: "war" },
  { d: "1945-05-08", t: "V-E Day", c: "war" },
  { d: "1945-07-16", t: "Trinity nuclear test", c: "tech" },
  { d: "1945-08-06", t: "Hiroshima bombing", c: "war" },
  { d: "1945-08-09", t: "Nagasaki bombing", c: "war" },
  { d: "1945-09-02", t: "V-J Day — WWII ends", c: "war" },
  { d: "1947-08-15", t: "Indian independence", c: "politics" },
  { d: "1948-05-14", t: "State of Israel founded", c: "politics" },
  { d: "1949-10-01", t: "People's Republic of China founded", c: "politics" },

  // Cold War / space
  { d: "1955-12-01", t: "Rosa Parks arrested", c: "cultural" },
  { d: "1957-10-04", t: "Sputnik launched", c: "space" },
  { d: "1961-04-12", t: "Gagarin — first human in space", c: "space" },
  { d: "1962-10-16", t: "Cuban Missile Crisis begins", c: "war" },
  { d: "1963-08-28", t: "March on Washington — I Have a Dream", c: "cultural" },
  { d: "1963-11-22", t: "JFK assassinated", c: "assassination" },
  { d: "1968-04-04", t: "MLK assassinated", c: "assassination" },
  { d: "1968-06-05", t: "RFK assassinated", c: "assassination" },
  { d: "1969-07-20", t: "Apollo 11 moon landing", c: "space" },
  { d: "1971-10-29", t: "First microprocessor Intel 4004 announced", c: "tech" },
  { d: "1972-06-17", t: "Watergate break-in", c: "politics" },
  { d: "1973-10-06", t: "Yom Kippur War begins", c: "war" },
  { d: "1973-10-17", t: "OPEC oil embargo", c: "market" },
  { d: "1974-08-09", t: "Nixon resigns", c: "politics" },
  { d: "1979-01-16", t: "Shah of Iran flees", c: "politics" },
  { d: "1979-03-28", t: "Three Mile Island accident", c: "disaster" },
  { d: "1979-11-04", t: "Iran hostage crisis begins", c: "politics" },
  { d: "1980-12-08", t: "John Lennon assassinated", c: "assassination" },
  { d: "1981-03-30", t: "Reagan assassination attempt", c: "assassination" },
  { d: "1986-01-28", t: "Challenger disaster", c: "disaster" },
  { d: "1986-04-26", t: "Chernobyl disaster", c: "disaster" },
  { d: "1987-10-19", t: "Black Monday market crash", c: "market" },
  { d: "1989-11-09", t: "Berlin Wall falls", c: "politics" },
  { d: "1991-08-06", t: "World Wide Web made public", c: "tech" },
  { d: "1991-12-26", t: "Soviet Union dissolved", c: "politics" },

  // Turn of century
  { d: "1995-04-19", t: "Oklahoma City bombing", c: "disaster" },
  { d: "1997-08-31", t: "Princess Diana killed", c: "cultural" },
  { d: "1998-09-04", t: "Google founded", c: "tech" },
  { d: "2000-03-10", t: "Dot-com bubble peaks", c: "market" },
  { d: "2001-09-11", t: "September 11 attacks", c: "disaster" },
  { d: "2003-02-01", t: "Space Shuttle Columbia disaster", c: "disaster" },
  { d: "2003-03-20", t: "Iraq War begins", c: "war" },
  { d: "2004-02-04", t: "Facebook launches", c: "tech" },
  { d: "2004-12-26", t: "Indian Ocean tsunami", c: "disaster" },
  { d: "2005-08-29", t: "Hurricane Katrina", c: "disaster" },
  { d: "2007-01-09", t: "iPhone unveiled", c: "tech" },
  { d: "2008-09-15", t: "Lehman Brothers collapse", c: "market" },
  { d: "2009-01-20", t: "Obama inauguration", c: "politics" },
  { d: "2010-04-20", t: "Deepwater Horizon explosion", c: "disaster" },
  { d: "2011-03-11", t: "Tōhoku earthquake and Fukushima", c: "disaster" },
  { d: "2011-05-02", t: "Bin Laden killed", c: "war" },
  { d: "2011-10-05", t: "Steve Jobs dies", c: "cultural" },
  { d: "2013-04-15", t: "Boston Marathon bombing", c: "disaster" },
  { d: "2014-03-08", t: "MH370 disappears", c: "disaster" },
  { d: "2014-07-17", t: "MH17 shot down", c: "war" },
  { d: "2015-11-13", t: "Paris attacks", c: "disaster" },
  { d: "2016-06-23", t: "Brexit referendum", c: "politics" },
  { d: "2016-11-08", t: "Trump elected", c: "politics" },
  { d: "2017-10-01", t: "Las Vegas shooting", c: "disaster" },
  { d: "2019-04-15", t: "Notre-Dame fire", c: "disaster" },
  { d: "2019-12-31", t: "COVID-19 first reported to WHO", c: "disaster" },
  { d: "2020-03-11", t: "WHO declares COVID pandemic", c: "disaster" },
  { d: "2020-03-16", t: "COVID market crash bottom near", c: "market" },
  { d: "2020-05-25", t: "George Floyd killed", c: "cultural" },
  { d: "2020-11-03", t: "US election day", c: "politics" },
  { d: "2021-01-06", t: "US Capitol attack", c: "politics" },
  { d: "2021-01-20", t: "Biden inauguration", c: "politics" },
  { d: "2022-02-24", t: "Russia invades Ukraine", c: "war" },
  { d: "2022-09-08", t: "Queen Elizabeth II dies", c: "cultural" },
  { d: "2022-11-30", t: "ChatGPT launched", c: "tech" },
  { d: "2023-03-10", t: "Silicon Valley Bank collapse", c: "market" },
  { d: "2023-10-07", t: "Hamas attack on Israel", c: "war" },
  { d: "2024-03-26", t: "Baltimore bridge collapse", c: "disaster" },
  { d: "2024-04-08", t: "North American total solar eclipse", c: "space" },
  { d: "2024-07-13", t: "Trump assassination attempt", c: "assassination" },
  { d: "2024-11-05", t: "US election day", c: "politics" },
  { d: "2025-01-20", t: "US presidential inauguration", c: "politics" },
];

/** Scheduled/known future dates worth scoring against future-mode candidates. */
export const KNOWN_FUTURE_MARKERS: DatedEvent[] = [
  { d: "2026-06-11", t: "FIFA World Cup 2026 opens", c: "cultural" },
  { d: "2026-07-04", t: "US Semiquincentennial (250 years)", c: "cultural" },
  { d: "2026-08-12", t: "Total solar eclipse (Europe)", c: "space" },
  { d: "2027-08-02", t: "Total solar eclipse (Egypt, 6m 22s)", c: "space" },
  { d: "2028-07-21", t: "Los Angeles Olympics open", c: "cultural" },
  { d: "2028-11-07", t: "US presidential election", c: "politics" },
  { d: "2029-04-13", t: "Asteroid Apophis close approach", c: "space" },
  { d: "2032-11-02", t: "US presidential election", c: "politics" },
  { d: "2033-04-14", t: "Halley-adjacent long-cycle marker", c: "space" },
];
