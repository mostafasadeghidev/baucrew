/**
 * A starting catalogue for a painting, plastering and drywall company: the
 * materials and tools nearly every job asks for. It is a list like any the
 * office would paste into the catalogue import (Lager → Liste importieren),
 * and that is how it is brought in — read by the same importer, with the same
 * preview, nothing overwritten. `prisma/seed.ts` brings it into a development
 * database.
 *
 * Machines are not here: they live in Wattro and come in with its sync.
 * Edit freely — one line per entry, semicolons between the columns.
 */
export const CATALOG_STARTER_CSV = `Art;Bezeichnung;Kategorie;Einheit
Material;Dispersionsfarbe weiß;Farben;Eimer
Material;Latexfarbe;Farben;Eimer
Material;Silikatfarbe;Farben;Eimer
Material;Fassadenfarbe;Farben;Eimer
Material;Lack weiß;Farben;Dose
Material;Lasur;Farben;Dose
Material;Tiefgrund;Grundierung;Liter
Material;Haftgrund;Grundierung;Eimer
Material;Sperrgrund;Grundierung;Eimer
Material;Spachtelmasse;Spachteln;Sack
Material;Fertigspachtel;Spachteln;Eimer
Material;Fugenspachtel;Spachteln;Sack
Material;Gipsputz;Putz;Sack
Material;Kalkzementputz;Putz;Sack
Material;Oberputz;Putz;Eimer
Material;Gewebe;Putz;Rolle
Material;Eckschutzschiene;Putz;Stück
Material;Gipskartonplatte 12,5 mm;Trockenbau;Platte
Material;Gipskarton Feuchtraum (GKBI);Trockenbau;Platte
Material;Gipskarton Feuerschutz (GKF);Trockenbau;Platte
Material;CW-Profil;Trockenbau;Stück
Material;UW-Profil;Trockenbau;Stück
Material;Schnellbauschrauben;Trockenbau;Packung
Material;Dämmwolle;Trockenbau;Paket
Material;Fugendeckstreifen;Trockenbau;Rolle
Material;Dübel;Befestigung;Packung
Material;Schrauben;Befestigung;Packung
Material;Abdeckfolie;Abdecken;Rolle
Material;Malerkrepp;Abdecken;Rolle
Material;Abdeckvlies;Abdecken;Rolle
Material;Abdeckpapier;Abdecken;Rolle
Material;Kantenschutz;Abdecken;Rolle
Material;Acryl;Fugen;Kartusche
Material;Silikon;Fugen;Kartusche
Material;Schleifpapier;Verbrauch;Packung
Material;Raufaser;Tapete;Rolle
Material;Vliestapete;Tapete;Rolle
Material;Tapetenkleister;Tapete;Packung
Werkzeug;Farbroller;Streichen;
Werkzeug;Farbwanne;Streichen;
Werkzeug;Abstreifgitter;Streichen;
Werkzeug;Teleskopstange;Streichen;
Werkzeug;Quast;Streichen;
Werkzeug;Pinsel-Set;Streichen;
Werkzeug;Flächenspachtel;Spachteln;
Werkzeug;Japanspachtel;Spachteln;
Werkzeug;Glättkelle;Putz;
Werkzeug;Traufel;Putz;
Werkzeug;Mörtelkübel;Putz;
Werkzeug;Rührquirl;Putz;
Werkzeug;Cuttermesser;Handwerkzeug;
Werkzeug;Wasserwaage;Handwerkzeug;
Werkzeug;Zollstock;Handwerkzeug;
Werkzeug;Akkuschrauber;Elektrowerkzeug;
Werkzeug;Bohrmaschine;Elektrowerkzeug;
Werkzeug;Schleifklotz;Handwerkzeug;
Werkzeug;Tapeziertisch;Tapete;
Werkzeug;Leiter;Zugang;
Werkzeug;Stehleiter;Zugang;
Werkzeug;Rollgerüst;Zugang;
Werkzeug;Verlängerungskabel;Strom;
Werkzeug;Baustrahler;Strom;
Werkzeug;Schutzbrille;Arbeitsschutz;
Werkzeug;Atemschutzmaske;Arbeitsschutz;
`
