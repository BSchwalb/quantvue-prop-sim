# Prop Sim

Auswertung von QuantVue-Backtests (einzeln und als Stacks) mit Fokus auf Prop-Firm-Accounts:
Gewinn, Max Drawdown inkl. offener Verluste und **Ø Monatsgewinn / Max DD**. Später: Account-Simulation und Monte Carlo (siehe [docs/PLAN.md](docs/PLAN.md)).

## Starten

```bash
npm install
npm run dev      # lokal unter http://localhost:5173
npm test         # Rechenkern-Tests
npm run build    # Produktions-Build (Vercel macht das automatisch)
```

## Daten

- Backtests: `src/data/strategies/*.csv` (QuantVue-Export)
- Metadaten (Instrument, $/Punkt, Standard-Kontrakte, Kosten): `src/data/strategies.json`
- Fest hinterlegte Stacks: `src/data/stacks.json`
- In der App angelegte Stacks liegen im Browser (Export/Import als JSON möglich)

Neuen Backtest importieren:

```bash
node scripts/import-backtest.mjs --file export.csv --id mein_algo --name "Mein Algo" --instrument MNQ --qty 3
```
