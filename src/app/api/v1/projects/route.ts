import { query, readJson, withApi } from '@/lib/api-http'
import { createProject, createProjectInput, listProjects, listProjectsInput } from '@/lib/api-service'

export async function GET(req: Request) {
  return withApi(req, ({ user }) => listProjects(user, listProjectsInput.parse(query(req))))
}

export async function POST(req: Request) {
  return withApi(req, async ({ user }) => createProject(user, createProjectInput.parse(await readJson(req))))
}
