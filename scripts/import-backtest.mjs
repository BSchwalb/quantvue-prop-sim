#!/usr/bin/env node
// Importiert einen QuantVue-Backtest-Export ins Repo.
// Nutzung:
//   node scripts/import-backtest.mjs --file <pfad.csv> --id <id> --name "<Name>" --instrument MNQ --qty 3 [--cost <$ pro Kontrakt, Standard: Micro 2 / Mini 20>] [--pointValue 2]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const POINT_VALUES = { ES: 50, MES: 5, NQ: 20, MNQ: 2, RTY: 50, M2K: 5, YM: 5, MYM: 0.5, GC: 100, MGC: 10, CL: 1000, MCL: 100 }
const MICROS = new Set(['MES', 'MNQ', 'M2K', 'MYM', 'MGC', 'MCL'])
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = {}
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
for (const k of ['file', 'id', 'name', 'instrument', 'qty']) {
  if (!args[k]) {
    console.error(`Fehlt: --${k}`)
    process.exit(1)
  }
}
const instrument = args.instrument.toUpperCase()
const pointValue = args.pointValue ? Number(args.pointValue) : POINT_VALUES[instrument]
if (!pointValue) {
  console.error(`Unbekanntes Instrument ${instrument} – bitte --pointValue angeben`)
  process.exit(1)
}

const csv = fs.readFileSync(args.file, 'utf8')
const header = csv.split(/\r?\n/)[0]
for (const col of ['entry_date', 'exit_date', 'pnl_points', 'mae', 'mfe']) {
  if (!header.includes(col)) {
    console.error(`CSV-Spalte fehlt: ${col}`)
    process.exit(1)
  }
}

const id = args.id.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
const file = `${id}.csv`
fs.writeFileSync(path.join(root, 'src/data/strategies', file), csv)

const metaPath = path.join(root, 'src/data/strategies.json')
const list = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
const entry = {
  id,
  name: args.name,
  instrument,
  pointValue,
  defaultQty: Number(args.qty),
  // Standardkosten pro Roundtrip inkl. Slippage: Micro $2, Mini $20
  costPerContract: Number(args.cost ?? (MICROS.has(instrument) ? 2 : 20)),
  file,
  notes: `Export ${path.basename(args.file)}`,
}
const idx = list.findIndex((s) => s.id === id)
if (idx >= 0) list[idx] = entry
else list.push(entry)
fs.writeFileSync(metaPath, JSON.stringify(list, null, 2) + '\n')

const rows = csv.trim().split(/\r?\n/).length - 1
console.log(`${idx >= 0 ? 'Aktualisiert' : 'Importiert'}: ${id} (${rows} Trades, ${instrument} × ${entry.defaultQty}, $${pointValue}/Pkt)`)
