import { withApi } from '@/lib/api-http'
import { addProjectFile, ApiError } from '@/lib/api-service'

type Ctx = { params: Promise<{ id: string }> }

/** One file onto the project, as multipart form data in the field `file`. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return withApi(req, async ({ user }) => {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) throw new ApiError(400, 'empty', 'Send the file as multipart form data in the field "file".')
    return addProjectFile(user, id, file)
  })
}
