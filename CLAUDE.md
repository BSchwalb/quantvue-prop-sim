# Prop Sim – Hinweise für Claude

Web-App (Vite + React + TypeScript), läuft komplett im Browser, Deployment über Vercel (Push auf `main`).
Sprache der App und der Kommunikation: Deutsch.

## Neue Backtests hochgeladen

1. **Immer nachfragen**, bevor importiert wird:
   - Instrument (z. B. MNQ, MES, M2K, NQ, ES …)
   - Kontraktzahl (Standard-Qty), mit der der Algo gehandelt wird
   - Name/Bezeichnung, falls aus dem Dateinamen nicht eindeutig
   - Kosten: Standard $2 pro Kontrakt und Roundtrip (inkl. Slippage), außer der User sagt etwas anderes
2. Import:
   ```bash
   node scripts/import-backtest.mjs --file <upload.csv> --id <id> --name "<Name>" --instrument MNQ --qty 3
   ```
3. Optional neue Stacks in `src/data/stacks.json` ergänzen, wenn der User einen Stack nennt.
4. `npm test && npm run build`, dann committen und pushen.

## Konventionen

- CSV-Werte (`pnl_points`, `mae`, `mfe`) sind Punkte pro 1 Kontrakt; Skalierung erfolgt über `Leg.qty × pointValue`.
- Max Drawdown = Höchststand (realisiert) bis Tiefpunkt inkl. offener Buchverluste (MAE). Überlappende Trades: MAEs werden als gleichzeitig angenommen (Worst Case).
- Kernkennzahl: Ø Monatsgewinn / Max DD.
- Rechenlogik gehört in `src/core/` (reine Funktionen, mit Tests in `*.test.ts`), UI in `src/components/`.
- Projektplan: `docs/PLAN.md`.
