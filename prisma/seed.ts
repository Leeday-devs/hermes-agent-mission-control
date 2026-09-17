import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import * as fs from 'node:fs'
import * as path from 'node:path'

const prisma = new PrismaClient()
const DATA_DIR = './data'
type SeedRow = Record<string, unknown>

function readJson(filename: string): unknown {
  const filePath = path.join(DATA_DIR, filename)
  if (!fs.existsSync(filePath)) {
    console.warn(`Missing: ${filename}`)
    return null
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function readRows(filename: string): SeedRow[] | null {
  const value = readJson(filename)
  return Array.isArray(value)
    ? value.filter((row): row is SeedRow => Boolean(row) && typeof row === 'object')
    : null
}

function stringValue(row: SeedRow, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' ? value : undefined
}

function safeDate(value: string | undefined, fallback = new Date()): Date {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

async function seedIdeas() {
  const rows = readRows('ideas.json')
  if (!rows) return
  console.log(`Seeding ${rows.length} ideas...`)

  for (const row of rows) {
    const id = stringValue(row, 'id') ?? randomUUID()
    await prisma.idea.upsert({
      where: { id },
      update: {},
      create: {
        id,
        title: stringValue(row, 'title') ?? '',
        description: stringValue(row, 'description') ?? null,
        category: stringValue(row, 'category') ?? null,
        type: stringValue(row, 'type') ?? null,
        model: stringValue(row, 'model') ?? null,
        status: stringValue(row, 'status') ?? null,
        timestamp: safeDate(stringValue(row, 'timestamp')),
      },
    })
  }
}

async function seedClientProjects() {
  const rows = readRows('client-projects.json')
  if (!rows) return
  console.log(`Seeding ${rows.length} client projects...`)

  for (const row of rows) {
    const id = stringValue(row, 'id') ?? randomUUID()
    const dueDate = stringValue(row, 'dueDate')
    await prisma.clientProject.upsert({
      where: { id },
      update: {},
      create: {
        id,
        clientName: stringValue(row, 'clientName') ?? '',
        projectName: stringValue(row, 'projectName') ?? '',
        status: stringValue(row, 'status') ?? 'not_started',
        priority: stringValue(row, 'priority') ?? 'medium',
        notes: stringValue(row, 'notes') ?? null,
        dueDate: dueDate ? safeDate(dueDate) : null,
        createdAt: safeDate(stringValue(row, 'createdAt')),
      },
    })
  }
}

async function main() {
  await seedIdeas()
  await seedClientProjects()
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
