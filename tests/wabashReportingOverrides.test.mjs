import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

async function importTypeScriptModule(sourcePath) {
  const source = await readFile(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const tempDir = await mkdtemp(join(tmpdir(), 'deshazo-wabash-overrides-'))
  const modulePath = join(tempDir, 'wabashReportingOverrides.mjs')
  await writeFile(modulePath, transpiled.outputText)
  return import(modulePath)
}

const overrides = await importTypeScriptModule(new URL('../src/lib/wabashReportingOverrides.ts', import.meta.url))

test('maps known Wabash source-data location mismatches to Phoenix, AZ', () => {
  const installationOverride = overrides.getWabashReportingLocationOverride({
    customer: 'wabash',
    workOrderId: 61077,
  })

  assert.equal(installationOverride?.locationLabel, 'Phoenix, AZ')
  assert.equal(installationOverride?.locationValue, 'phoenix_az')

  const repairOverride = overrides.getWabashReportingLocationOverride({
    customer: 'wabash',
    jobNo: '0275240',
  })

  assert.equal(repairOverride?.locationLabel, 'Phoenix, AZ')
})

test('does not apply the Phoenix override outside Wabash context', () => {
  const override = overrides.getWabashReportingLocationOverride({
    customer: 'other customer',
    workOrderId: 61077,
  })

  assert.equal(override, null)
})

test('preserves fallback labels when no Wabash Phoenix override applies', () => {
  assert.equal(
    overrides.applyWabashReportingLocationLabel(
      { customer: 'wabash', workOrderId: 12345 },
      'Jonestown, PA',
    ),
    'Jonestown, PA',
  )
})
