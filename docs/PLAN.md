# Projektplan

Ziel: QuantVue-Backtests (einzeln und als Stacks) auswerten und simulieren, wie sich das wiederholte Kaufen von Prop-Firm-Accounts mit einem Algo/Stack auswirkt.

## Phase 0 – Grundgerüst ✅
- Vite + React + TypeScript, Deployment via Vercel
- Backtests als CSV in `src/data/strategies/`, Metadaten in `strategies.json`
- Import-Skript `scripts/import-backtest.mjs`

## Phase 1 – Rechenkern & Kennzahlen ✅
- Trades skaliert mit Kontraktzahl × $/Punkt, abzüglich Kosten pro Kontrakt (Roundtrip)
- Equity-Pfad über alle Trades (auch überlappend, mehrere Algos): realisiert / Tiefpunkt inkl. MAE / Hochpunkt inkl. MFE
- Kennzahlen pro Zeitraum (Standard: laufendes Jahr): Gewinn, Max DD inkl. offener Verluste, Ø Gewinn/Monat, **Monat/DD**, Win %, PF, schlechtester Tag, Verlustserie, Monatsübersicht

## Phase 2 – Oberfläche ✅
- Übersicht Strategien + Stacks, sortierbar, Kontraktzahl pro Strategie editierbar
- Detailansicht mit Equity-, Drawdown- und Monatschart
- Stack-Builder: Algos wählen, Qty pro Algo, Live-Kennzahlen, speichern im Browser, Export/Import JSON

## Phase 3 – Prop-Account-Simulation (historisch) ✅
Account-Vorlage: Profit Target, Max DD (trailing), Buffer-Ziel, Kosten.
1. **Evaluation**: Start bei Startbalance, Trailing DD (trailt bis zum Bestehen, kein Einfrieren); bestanden sobald Target erreicht → an diesem Tag kein weiterer Trade.
2. **Freischaufeln** (nächster Handelstag): Neustart bei Startbalance, Trailing DD, der bei Startbalance einfriert, sobald Höchststand ≥ Start + DD. Freigeschaltet bei Start + Buffer-Ziel.
3. Verloren oder freigeschaltet → am nächsten Handelstag neuer Account. Freigeschaltete Accounts → Portfolio.
- Trailing basiert auf End-of-Day-Balance; Verletzung wird intraday inkl. offener Verluste (MAE) geprüft. Intraday-Trailing (MFE) später als Option
- Ausgabe: Account-Zeitleiste, freigeschaltete Accounts pro Monat/Jahr, Ø Tage bis Freischaltung, Kosten pro freigeschaltetem Account, Bestehensquoten je Phase
- Rollierender Start: Simulation ab jedem historischen Handelstag

## Phase 4 – Monte Carlo ✅
- Pool = alle Werktage im gewählten Zeitraum (inkl. Tage ohne Trades)
- Methoden: Tage ziehen mit Zurücklegen (1 Jahr = 261 Werktage) oder Tage neu mischen (Gesamtgewinn bleibt gleich)
- Ganze Handelstage werden gezogen (erhält Gleichzeitigkeit der Algos im Stack); alle Algos/Stacks laufen auf denselben Ziehungen
- Kein Speichern nötig: fester Seed → reproduzierbare Ziehungen, Berechnung dauert < 1 s
- Wahrscheinlichkeiten und Verteilungen (Median, P10/P90) für Kosten, Dauer, Accounts pro Jahr
- Vergleich/Ranking von Algos und Stacks für die Account-Strategie

## Später
- Mehrere Accounts parallel, Payout-Regeln, Daily Loss Limit, Consistency-Regeln
- Speicherung geräteübergreifend (z. B. Neon/Upstash über Vercel)
