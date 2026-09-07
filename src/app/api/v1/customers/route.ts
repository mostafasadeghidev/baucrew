import { query, readJson, withApi } from '@/lib/api-http'
import { createCustomer, createCustomerInput, listCustomers } from '@/lib/api-service'

export async function GET(req: Request) {
  const { q, limit } = query(req)
  return withApi(req, ({ user }) => listCustomers(user, q || undefined, limit ? Number(limit) : undefined))
}

export async function POST(req: Request) {
  return withApi(req, async ({ user }) => createCustomer(user, createCustomerInput.parse(await readJson(req))))
}
